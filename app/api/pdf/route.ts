import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// llama-3.3-70b-versatile has 12K TPM free tier (8b-instant is only 6K)
const PDF_MODEL = 'llama-3.3-70b-versatile'

// ~8,000 tokens of text per chunk — leaves ~3K headroom under the 12K TPM limit
// for the prompt/schema/rules overhead. 1 token ≈ 4 chars → 8,000 * 4 = 32,000 chars
const MAX_CHUNK_CHARS = 32000

async function extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)

  const uint8Array = new Uint8Array(buffer)
  const loadingTask = (pdfjs as any).getDocument({
    data: uint8Array,
    ...(password ? { password } : {}),
  })

  let doc: any
  try {
    doc = await loadingTask.promise
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      const code = err?.code
      if (code === 1) throw new Error('PDF_NEED_PASSWORD')
      if (code === 2) throw new Error('PDF_WRONG_PASSWORD')
    }
    throw err
  }

  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
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
    for (const [, cells] of sorted) {
      lines.push(cells.join('\t'))
    }
    lines.push('<<PAGE_BREAK>>')
  }

  return lines.join('\n')
}

async function parseChunk(
  chunkText: string,
  schema: string,
  rules: string,
  billingContext: string
): Promise<any[]> {
  const prompt = `You are an expert Indian bank statement parser.

${billingContext}

The following is tab-separated text extracted from a bank statement PDF. Parse ALL transactions.

${schema}

${rules}

Statement text:
${chunkText}`

  const completion = await groq.chat.completions.create({
    model: PDF_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(clean)
}

// Strip repeated page headers, very short lines, and duplicate whitespace to cut token count
function compressPdfText(text: string): string {
  const lineCount = new Map<string, number>()
  const result: string[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()

    // Keep page break markers as-is
    if (trimmed === '<<PAGE_BREAK>>') { result.push(trimmed); continue }

    // Drop blank or very short lines (likely separators, page numbers)
    if (trimmed.length < 5) continue

    // Drop lines that repeat more than twice across the doc (bank name, address, table headers)
    const count = (lineCount.get(trimmed) ?? 0) + 1
    lineCount.set(trimmed, count)
    if (count > 2) continue

    result.push(trimmed)
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

  if (!file) return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].join(', ')

  const billingContext = statementDay
    ? `This statement is generated on day ${statementDay} of the month. The billing cycle runs from day ${statementDay} of the previous month to day ${statementDay} of the statement month. Use this to correctly assign the year when dates don't include one.`
    : 'Use context clues to infer the correct year for each transaction date.'

  const rules = `Rules:
- Include ALL transactions — do NOT skip any
- Skip opening/closing balance lines — those are NOT transactions
- If a row has both debit and credit columns, use the non-zero value and set type accordingly
- Cashbacks, refunds, and reversals are "income"
- Return ONLY a valid JSON array sorted by date descending
- No markdown, no explanation, just the JSON array`

  const schema = `For each transaction return a JSON object:
- date: "YYYY-MM-DD"
- description: merchant or transaction name (max 60 chars)
- amount: positive number, no currency symbol
- type: "income" for credits/deposits/cashbacks/refunds, "expense" for debits/payments
- category: best match from: ${allCategories}`

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
    throw err
  }

  try {
    const compressed = compressPdfText(text)
    const chunks = splitIntoChunks(compressed)
    const allTransactions: any[] = []

    for (const chunk of chunks) {
      const txs = await parseChunk(chunk, schema, rules, billingContext)
      if (Array.isArray(txs)) allTransactions.push(...txs)
    }

    // Sort merged results by date descending
    allTransactions.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    return NextResponse.json({ transactions: allTransactions })
  } catch (err: any) {
    console.error('PDF parse error:', err)

    if (err?.status === 429 || err?.status === 413) {
      return NextResponse.json(
        { error: 'AI rate limit hit — the statement may be too large. Try importing fewer pages or wait a minute.' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to parse PDF. Make sure it is a readable bank statement.' },
      { status: 500 }
    )
  }
}
