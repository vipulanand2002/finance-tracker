import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// ~8,000 tokens of text per chunk — leaves ~3K headroom under the 12K TPM limit
// for the prompt/schema/rules overhead. 1 token ≈ 4 chars → 8,000 * 4 = 32,000 chars
const MAX_CHUNK_CHARS = 32000

// Prefer larger, newer chat/instruct models. Patterns ordered best→worst.
const MODEL_PREFERENCE: RegExp[] = [
  /llama-3\.3-70b/,
  /llama.*3.*70b.*versatile/,
  /llama.*70b/,
  /qwen.*72b/,
  /mixtral.*8x7b/,
  /llama.*3.*8b.*instant/,
  /llama.*8b/,
]

// Exclude non-chat models regardless of name match
const MODEL_EXCLUDE = /whisper|guard|tts|embed|vision|preview/i

// Module-level cache — survives warm Lambda invocations, avoids per-request latency
let modelCache: { id: string; expiresAt: number } | null = null

async function resolveBestModel(invalidate = false): Promise<string> {
  if (invalidate) modelCache = null
  const now = Date.now()
  if (modelCache && now < modelCache.expiresAt) return modelCache.id

  try {
    const page = await groq.models.list()
    const ids: string[] = (page.data ?? []).map((m: any) => String(m.id))
    const eligible = ids.filter(id => !MODEL_EXCLUDE.test(id))

    for (const pattern of MODEL_PREFERENCE) {
      const match = eligible.find(id => pattern.test(id))
      if (match) {
        modelCache = { id: match, expiresAt: now + 3_600_000 }
        console.log('[PDF] Using Groq model:', match)
        return match
      }
    }

    // Any eligible model is better than nothing
    const fallback = eligible[0] ?? 'llama3-70b-8192'
    modelCache = { id: fallback, expiresAt: now + 3_600_000 }
    console.log('[PDF] Using Groq fallback model:', fallback)
    return fallback
  } catch (err) {
    console.warn('[PDF] Could not list Groq models, using default:', err)
    return 'llama3-70b-8192'
  }
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

function isModelGone(err: any): boolean {
  const msg = (err?.error?.error?.message ?? err?.message ?? '').toLowerCase()
  return (
    err?.status === 404 ||
    err?.status === 410 ||
    (err?.status === 400 && (
      msg.includes('decommission') ||
      msg.includes('deprecated') ||
      msg.includes('no longer supported') ||
      msg.includes('not supported')
    ))
  )
}

// Robustly extract a JSON array from a model response that may include
// prose, code fences, or a wrapper object {"transactions":[...]}.
function extractJsonArray(raw: string): any[] {
  // Strip all code fences globally (models often add them mid-response)
  const stripped = raw.replace(/```(?:json)?/gi, '').trim()

  // 1. Direct parse — covers bare arrays and {"transactions":[...]} wrappers
  try {
    const parsed = JSON.parse(stripped)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.transactions)) return parsed.transactions
  } catch { /* fall through */ }

  // 2. Bracket-match: find the first [...] in the text, ignore surrounding prose
  const start = stripped.indexOf('[')
  if (start !== -1) {
    let depth = 0, end = -1
    for (let i = start; i < stripped.length; i++) {
      if (stripped[i] === '[') depth++
      else if (stripped[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(stripped.slice(start, end + 1))
        if (Array.isArray(parsed)) return parsed
      } catch { /* fall through */ }
    }
  }

  console.warn('[PDF] extractJsonArray failed. Raw output (first 300 chars):', raw.slice(0, 300))
  return []
}

async function parseChunk(chunkText: string, categories: string, billingContext: string): Promise<any[]> {
  const prompt = `Extract ALL transactions from this bank statement. ${billingContext}

Respond with ONLY a raw JSON array — no explanation, no markdown, no code fences.
Each element: { "date":"YYYY-MM-DD", "description":"<merchant, max 60 chars>", "amount":<positive number>, "type":"income" or "expense", "category":"<from list>" }

Rules:
- type is "income" for CREDIT entries, refunds, cashback, deposits; "expense" for everything else
- Omit balance lines (opening/closing balance, totals) and non-transaction lines (headers, account info)
- Categories: ${categories}

Statement text:
${chunkText}`

  // Two attempts: first with cached model, second with fresh model list if the cached one is gone
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = await resolveBestModel(attempt > 0)
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      })

      const raw = completion.choices[0]?.message?.content ?? ''
      console.log(`[PDF] Model: ${model} | output length: ${raw.length} | preview: ${raw.slice(0, 120)}`)
      return extractJsonArray(raw)
    } catch (err: any) {
      if (isModelGone(err) && attempt === 0) {
        console.warn(`[PDF] Model ${model} gone (${err?.status}), retrying with fresh model list`)
        continue
      }
      throw err
    }
  }
  throw new Error('No available Groq model found after refreshing model list')
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
    const allTransactions: any[] = []

    for (const chunk of chunks) {
      const txs = await parseChunk(chunk, allCategories, billingContext)
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

    if (err?.status === 429 || err?.status === 413) {
      return NextResponse.json(
        { error: 'AI rate limit hit — the statement may be too large. Try importing fewer pages or wait a minute.' },
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
