import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// ~3,000 tokens of input text per chunk.  Groq free tier caps many models at
// 6,000 TPM; keeping input+output well under that lets us avoid rate limits.
// 1 token ≈ 4 chars → 3,000 * 4 = 12,000 chars
const MAX_CHUNK_CHARS = 12000

// Prefer larger, newer chat/instruct models. Patterns ordered best→worst.
// Verified working on Groq Aug 2026: qwen/qwen3.6-27b (produces output).
// gpt-oss-120b and gpt-oss-20b consistently return empty — moved to bottom.
const MODEL_PREFERENCE: RegExp[] = [
  // Qwen — confirmed working (thinking blocks stripped by extractJsonArray)
  /qwen/i,
  // Llama 4
  /llama-4.*maverick/i,
  /llama-4.*scout/i,
  /llama.*4.*\d+b/i,
  // Llama 3.x 70B
  /llama-3\.3-70b/i,
  /llama.*3.*70b/i,
  /llama.*70b/i,
  // DeepSeek (also a reasoning model — thinking blocks handled)
  /deepseek/i,
  // Mixtral / Gemma
  /mixtral.*8x7b/i,
  /gemma.*27b/i,
  // Groq compound
  /groq\/compound(?!.*mini)/i,
  // Smaller models
  /llama.*8b.*instant/i,
  /llama.*8b/i,
  /gemma.*9b/i,
  /groq\/compound/i,
  // OpenAI OSS on Groq — returns empty content currently, last resort
  /gpt-oss/i,
]

// Exclude non-chat model families and reasoning models that ignore /no_think on Groq.
// Qwen3 floods its output with <think> blocks that exhaust max_tokens, leaving no JSON.
const MODEL_EXCLUDE =
  /whisper|guard|safeguard|tts|embed|vision|preview|orpheus|playai|speech|audio|distil-whisper|qwen/i

// Cache the full ordered model list, not just one model, so we can iterate through fallbacks
let modelsCache: { ordered: string[]; expiresAt: number } | null = null

async function resolveModels(invalidate = false): Promise<string[]> {
  if (invalidate) modelsCache = null
  const now = Date.now()
  if (modelsCache && now < modelsCache.expiresAt) return modelsCache.ordered

  const page = await groq.models.list()
  const ids: string[] = (page.data ?? []).map((m: any) => String(m.id))
  const eligible = ids.filter(id => !MODEL_EXCLUDE.test(id))

  console.log('[PDF] Groq models available:', ids.join(', '))
  console.log('[PDF] Eligible (non-excluded):', eligible.join(', '))

  // Sort by MODEL_PREFERENCE order; unmatched models go to the end
  const ordered: string[] = []
  for (const pattern of MODEL_PREFERENCE) {
    for (const id of eligible) {
      if (pattern.test(id) && !ordered.includes(id)) ordered.push(id)
    }
  }
  for (const id of eligible) {
    if (!ordered.includes(id)) ordered.push(id)
  }

  console.log('[PDF] Model priority order:', ordered.join(', '))
  modelsCache = { ordered, expiresAt: now + 3_600_000 }
  return ordered
}

async function extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string> {
  // pdf-parse bundles its own pdfjs v2 which is Node.js-native (no browser APIs).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (src: any, options?: any) => Promise<any>

  const lines: string[] = []

  const options = {
    // pagerender receives a pdfjs Page object — same API as pdfjs-dist
    pagerender: async (page: any): Promise<string> => {
      const content = await page.getTextContent()

      // Group text items by Y position to reconstruct table rows
      const rowMap = new Map<number, string[]>()
      for (const item of content.items as any[]) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round(item.transform[5])
        if (!rowMap.has(y)) rowMap.set(y, [])
        rowMap.get(y)!.push(item.str.trim())
      }

      // Sort top-to-bottom (PDF y=0 is bottom, so descending)
      const sorted = [...rowMap.entries()].sort((a, b) => b[0] - a[0])
      for (const [, cells] of sorted) lines.push(cells.join('\t'))
      lines.push('<<PAGE_BREAK>>')

      return '' // pdf-parse expects a string return from pagerender
    },
    max: 0, // No page limit
  }

  // Pass data as an object when a password is needed so pdfjs v2 can decrypt it
  const src = password
    ? { data: Buffer.from(buffer), password }
    : Buffer.from(buffer)

  try {
    await pdfParse(src, options)
  } catch (err: any) {
    const errName = err?.name ?? ''
    const errMsg = (err?.message ?? '').toLowerCase()
    if (errName === 'PasswordException' || errMsg.includes('password')) {
      if (password) throw new Error('PDF_WRONG_PASSWORD')
      throw new Error('PDF_NEED_PASSWORD')
    }
    throw err
  }

  return lines.join('\n')
}

function isModelUnusable(err: any): boolean {
  const msg = (err?.error?.error?.message ?? err?.message ?? '').toLowerCase()
  return (
    err?.status === 404 ||
    err?.status === 410 ||
    err?.status === 413 || // request too large for this model — try next
    (err?.status === 400 && (
      msg.includes('decommission') ||
      msg.includes('deprecated') ||
      msg.includes('no longer supported') ||
      msg.includes('not supported') ||
      msg.includes('terms') // terms not accepted (e.g. orpheus)
    ))
  )
}

// Some models emit JS object-literal syntax with unquoted keys: {date: "..."}.
// This is valid JS but not valid JSON. Repair it before parsing.
function repairJsonKeys(text: string): string {
  // Match { or , followed by optional whitespace + unquoted identifier + colon
  // Skip already-quoted keys (they start with " after the { / ,)
  return text.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3')
}

// Robustly extract a JSON array from a model response that may include
// prose, code fences, unquoted keys, <think> blocks, or a wrapper object {"transactions":[...]}.
function extractJsonArray(raw: string): any[] {
  // Strip <think>...</think> reasoning blocks (Qwen3, DeepSeek-R1, etc.)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
  // Handle unclosed <think> tag (model output cut off mid-thought)
  cleaned = cleaned.replace(/<think>[\s\S]*/i, '').trim()

  // Strip all code fences globally
  const stripped = cleaned.replace(/```(?:json)?/gi, '').trim()
  // Repair unquoted keys so JSON.parse can handle JS object literal output
  const repaired = repairJsonKeys(stripped)

  // 1. Direct parse of repaired text
  try {
    const parsed = JSON.parse(repaired)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.transactions)) return parsed.transactions
  } catch { /* fall through */ }

  // 2. Bracket-match: find the first [...] in the text, ignore surrounding prose
  const start = repaired.indexOf('[')
  if (start !== -1) {
    let depth = 0, end = -1
    for (let i = start; i < repaired.length; i++) {
      if (repaired[i] === '[') depth++
      else if (repaired[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(repaired.slice(start, end + 1))
        if (Array.isArray(parsed)) return parsed
      } catch { /* fall through */ }
    }
  }

  console.warn('[PDF] extractJsonArray failed. Raw output (first 300 chars):', raw.slice(0, 300))
  return []
}

function getRetryAfterMs(err: any, defaultMs = 15_000): number {
  // Groq may send retry-after as seconds in a header
  const header =
    err?.headers?.['retry-after'] ??
    (typeof err?.headers?.get === 'function' ? err.headers.get('retry-after') : undefined)
  const secs = header ? parseInt(String(header), 10) : NaN
  return isNaN(secs) ? defaultMs : Math.min(secs * 1000, 30_000) // cap at 30 s
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY not configured'), { skip: true })

  const genai = new GoogleGenerativeAI(apiKey)
  const model = genai.getGenerativeModel({
    model: 'gemini-3.6-flash',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      // thinkingBudget:0 disables reasoning tokens so all output budget goes to JSON
      thinkingConfig: { thinkingBudget: 0 },
    } as any,
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

async function parseChunk(chunkText: string, categories: string, billingContext: string): Promise<any[]> {
  const prompt = `Extract ALL transactions from this bank statement. ${billingContext}

Respond with ONLY a valid JSON array — no explanation, no markdown, no code fences, all keys must be double-quoted.
Each element: { "date":"YYYY-MM-DD", "description":"<merchant, max 60 chars>", "amount":<positive number>, "type":"income" or "expense", "category":"<from list>" }

Rules:
- type is "income" for CREDIT entries, refunds, cashback, deposits; "expense" for everything else
- Omit balance lines (opening/closing balance, totals) and non-transaction lines (headers, account info)
- Categories: ${categories}

Statement text:
${chunkText}`

  // ── Primary: Gemini 2.0 Flash (1M TPM free tier, no thinking overhead) ──
  try {
    const raw = await callGemini(prompt)
    console.log(`[PDF] gemini outLen=${raw.length} preview=${raw.slice(0, 100)}`)
    if (raw.trim()) return extractJsonArray(raw)
    console.warn('[PDF] Gemini returned empty — falling back to Groq')
  } catch (err: any) {
    if (err?.skip) {
      console.log('[PDF] Gemini not configured — using Groq')
    } else {
      console.warn('[PDF] Gemini error, falling back to Groq:', err?.message ?? err)
    }
  }

  // ── Fallback: iterate available Groq models ──
  const models = await resolveModels()

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You are a JSON extraction tool. Output ONLY a raw JSON array. No explanation, no markdown, no code fences.' },
            { role: 'user', content: `/no_think\n\n${prompt}` },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        })

        const raw = completion.choices[0]?.message?.content ?? ''
        console.log(`[PDF] groq model=${model} outLen=${raw.length} preview=${raw.slice(0, 100)}`)

        if (!raw.trim()) {
          console.warn(`[PDF] ${model} returned empty — skipping`)
          break
        }
        return extractJsonArray(raw)
      } catch (err: any) {
        if (err?.status === 429 && attempt < 2) {
          const wait = getRetryAfterMs(err)
          console.warn(`[PDF] Rate limited on ${model}. Waiting ${wait}ms (attempt ${attempt + 1}/3)`)
          await new Promise(r => setTimeout(r, wait))
          continue
        }
        if (isModelUnusable(err)) {
          console.warn(`[PDF] ${model} unusable (${err?.status}) — skipping`)
          break
        }
        throw err
      }
    }
  }

  await resolveModels(true) // refresh for next request
  throw new Error('All AI providers failed. Check Vercel logs for details.')
}

// Normalize CR/+ credit markers so the AI reliably identifies them as income.
// e.g. "1,500.00 CR" → "1,500.00(CREDIT)"   "+1,500.00" → "1,500.00(CREDIT)"
function normalizeCreditMarkers(line: string): string {
  line = line.replace(/([\d,]+(?:\.\d+)?)\s+CR\b/gi, '$1(CREDIT)')
  line = line.replace(/\+\s*([\d,]+(?:\.\d+)?)/g, '$1(CREDIT)')
  return line
}

// Strip repeated page headers, very short lines, and normalize credit markers
function compressPdfText(text: string): string {
  const lineCount = new Map<string, number>()
  const result: string[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()

    if (trimmed === '<<PAGE_BREAK>>') { result.push(trimmed); continue }
    if (trimmed.length < 5) continue

    const count = (lineCount.get(trimmed) ?? 0) + 1
    lineCount.set(trimmed, count)
    if (count > 2) continue

    result.push(normalizeCreditMarkers(trimmed))
  }

  return result.join('\n')
}

function splitIntoChunks(text: string): string[] {
  const pages = text.split('\n<<PAGE_BREAK>>\n')
  const chunks: string[] = []
  let current = ''

  for (const page of pages) {
    if (current && (current.length + page.length + 20) > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = page
    } else {
      current += (current ? '\n<<PAGE_BREAK>>\n' : '') + page
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('pdf') as File | null
  const password = (formData.get('password') as string | null)?.trim() || undefined
  const statementDay = (formData.get('statementDay') as string | null)?.trim() || null
  const isCard = formData.get('is_card') === 'true'

  if (!file) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].join(', ')

  const billingContext = statementDay
    ? `Statement day is ${statementDay}; use it to infer the correct year when dates lack one.`
    : 'Infer the correct year from context.'

  // Extract text from PDF (handles both password-protected and normal PDFs)
  let text: string
  try {
    text = await extractPdfText(buffer, password)
  } catch (err: any) {
    if (err?.message === 'PDF_WRONG_PASSWORD') {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 400, headers: { 'X-Password-Error': 'wrong' } }
      )
    }
    if (err?.message === 'PDF_NEED_PASSWORD') {
      return NextResponse.json(
        { error: 'This PDF requires a password.' },
        { status: 400, headers: { 'X-Password-Error': 'needed' } }
      )
    }
    console.error('PDF extraction error:', err?.name, err?.message)
    return NextResponse.json(
      { error: 'Could not read the PDF. It may be corrupted, scanned-only, or in an unsupported format.' },
      { status: 500 }
    )
  }

  try {
    const compressed = compressPdfText(text)
    const chunks = splitIntoChunks(compressed)
    console.log(`[PDF] ${chunks.length} chunk(s), compressed length: ${compressed.length}`)
    const allTransactions: any[] = []

    for (let i = 0; i < chunks.length; i++) {
      // Small proactive delay between chunks to stay under TPM on free tier
      if (i > 0) await new Promise(r => setTimeout(r, 3000))
      const txs = await parseChunk(chunks[i], allCategories, billingContext)
      if (Array.isArray(txs)) allTransactions.push(...txs)
    }

    // Sort merged results by date descending
    allTransactions.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // For credit card imports, fix wrong income categories (Salary, Gift, etc.)
    // while keeping type=income so they display as credits, not debits.
    // Refund stays Refund; everything else is a bill payment → Card Payment.
    const result = isCard
      ? allTransactions.map(t => {
          if (t.type !== 'income') return t
          if (t.category === 'Refund') return t
          return { ...t, category: 'Card Payment' }
        })
      : allTransactions

    return NextResponse.json({ transactions: result })
  } catch (err: any) {
    // Surface the real Groq error for easier diagnosis
    const groqMsg: string = err?.error?.error?.message ?? err?.message ?? ''
    console.error('PDF parse error — status:', err?.status, '| message:', groqMsg)

    if (err?.status === 429) {
      return NextResponse.json(
        { error: 'AI rate limit hit. Please wait a minute and try again.' },
        { status: 429 }
      )
    }
    if (err?.status === 401) {
      return NextResponse.json(
        { error: 'AI service authentication failed — check GROQ_API_KEY in environment variables.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: groqMsg || 'Failed to parse PDF. Make sure it is a readable bank statement.' },
      { status: 500 }
    )
  }
}
