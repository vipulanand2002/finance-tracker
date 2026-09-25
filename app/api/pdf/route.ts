import { createClient } from '@/lib/supabase/server'
import { geminiText } from '@/lib/ai'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

// ~3,000 tokens of input text per chunk keeps each Gemini call fast and the
// output well within limits. 1 token ≈ 4 chars → 3,000 * 4 = 12,000 chars
const MAX_CHUNK_CHARS = 12000

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

async function parseChunk(chunkText: string, categories: string, billingContext: string): Promise<any[]> {
  const prompt = `You are a precise bank statement parser. Extract ONLY actual debit/credit transactions from the text below. ${billingContext}

Respond with ONLY a valid JSON array — no explanation, no markdown, no code fences, all keys double-quoted.
Each element: { "date":"YYYY-MM-DD", "description":"<merchant or payee, max 60 chars>", "amount":<positive number>, "type":"income" or "expense", "category":"<from list>" }

STRICT INCLUSION RULE — include a row ONLY if ALL three are true:
1. It has a specific calendar date (day/month/year)
2. It has a clear merchant, payee, or transfer description (not a label like "Amount" or "Balance")
3. It has a single debit OR credit monetary amount

STRICT EXCLUSION — skip any row that is:
- Opening balance, closing balance, available balance, or any "balance" line
- Credit limit, available credit, minimum amount due, total amount due
- Reward points, cashback earned, miles, or non-monetary values
- Column headers (Date, Description, Debit, Credit, Amount, Balance, etc.)
- Summary totals, subtotals, or aggregate rows (Total Debit, Total Credit, etc.)
- Account info, statement period, customer name, account number, branch details
- Page numbers, footnotes, or promotional text
- Any row whose description is a generic label rather than a real merchant/payee
- Rows with amount = 0

TYPE RULES:
- "income" = CR / CREDIT / deposit / refund / cashback / reversal / payment received
- "expense" = DR / DEBIT / purchase / withdrawal / charge / fee / EMI

If a row shows both a debit column and a credit column, use whichever is non-zero.
If unsure whether a row is a real transaction, SKIP IT — false negatives are better than hallucinations.

Categories: ${categories}

Statement text:
${chunkText}`

  // Gemini with a couple of retries for transient/rate-limit errors
  let lastErr: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await geminiText(prompt, 0.1)
      console.log(`[PDF] gemini outLen=${raw.length} preview=${raw.slice(0, 100)}`)
      if (raw.trim()) return extractJsonArray(raw)
      console.warn('[PDF] Gemini returned empty — retrying')
    } catch (err: any) {
      lastErr = err
      const status = err?.status ?? err?.response?.status
      const transient = status === 429 || status === 503 || (status >= 500 && status < 600)
      if (transient && attempt < 2) {
        const wait = 5000 * (attempt + 1)
        console.warn(`[PDF] Gemini ${status} — waiting ${wait}ms (attempt ${attempt + 1}/3)`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw err
    }
  }

  if (lastErr) throw lastErr
  throw new Error('Gemini did not return any transactions. Check Vercel logs for details.')
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

    // Post-processing: drop clearly invalid rows
    const JUNK_DESC = /^(balance|total|subtotal|opening|closing|minimum|credit limit|available|amount due|statement|reward|cashback earned|points|miles|interest|principal|fees?|charges?|date|description|debit|credit|particulars|narration|details|ref(erence)?|sl\.?\s*no|sr\.?\s*no|s\.?\s*no)\.?$/i
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    const filtered = allTransactions.filter(t => {
      if (!t.date || !DATE_RE.test(t.date)) return false
      if (!t.amount || typeof t.amount !== 'number' || t.amount <= 0) return false
      if (!t.description || typeof t.description !== 'string') return false
      const desc = t.description.trim()
      if (desc.length < 3) return false
      if (JUNK_DESC.test(desc)) return false
      return true
    })
    console.log(`[PDF] Filtered ${allTransactions.length - filtered.length} junk rows, kept ${filtered.length}`)

    // Sort merged results by date descending
    filtered.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // For credit card imports, fix wrong income categories (Salary, Gift, etc.)
    // while keeping type=income so they display as credits, not debits.
    // Refund stays Refund; everything else is a bill payment → Card Payment.
    const result = isCard
      ? filtered.map(t => {
          if (t.type !== 'income') return t
          if (t.category === 'Refund') return t
          return { ...t, category: 'Card Payment' }
        })
      : filtered

    return NextResponse.json({ transactions: result })
  } catch (err: any) {
    // Surface the real Gemini error for easier diagnosis
    const aiMsg: string = err?.error?.error?.message ?? err?.message ?? ''
    const status = err?.status ?? err?.response?.status
    console.error('PDF parse error — status:', status, '| message:', aiMsg)

    if (status === 429) {
      return NextResponse.json(
        { error: 'AI rate limit hit. Please wait a minute and try again.' },
        { status: 429 }
      )
    }
    if (status === 401 || status === 403 || /api key/i.test(aiMsg)) {
      return NextResponse.json(
        { error: 'AI service authentication failed — check GEMINI_API_KEY in environment variables.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: aiMsg || 'Failed to parse PDF. Make sure it is a readable bank statement.' },
      { status: 500 }
    )
  }
}
