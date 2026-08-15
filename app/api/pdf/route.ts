import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

// pdfjs-dist v6 references browser DOM geometry APIs at module-load time.
// Vercel/Node.js doesn't have them — provide minimal stubs so the module loads.
if (typeof globalThis.DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = init[0]; this.b = this.m12 = init[1]
        this.c = this.m21 = init[2]; this.d = this.m22 = init[3]
        this.e = this.m41 = init[4]; this.f = this.m42 = init[5]
      }
    }
    static fromMatrix() { return new (globalThis as any).DOMMatrix() }
    static fromFloat32Array(a: Float32Array) { return new (globalThis as any).DOMMatrix(Array.from(a)) }
    static fromFloat64Array(a: Float64Array) { return new (globalThis as any).DOMMatrix(Array.from(a)) }
    multiply(o: any) {
      const m = new (globalThis as any).DOMMatrix()
      m.a = this.a * o.a + this.c * o.b; m.b = this.b * o.a + this.d * o.b
      m.c = this.a * o.c + this.c * o.d; m.d = this.b * o.c + this.d * o.d
      m.e = this.a * o.e + this.c * o.f + this.e; m.f = this.b * o.e + this.d * o.f + this.f
      return m
    }
    translate(tx = 0, ty = 0) {
      return new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e + this.a * tx + this.c * ty, this.f + this.b * tx + this.d * ty])
    }
    scale(sx = 1, sy = sx) {
      return new (globalThis as any).DOMMatrix([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f])
    }
    inverse() { return new (globalThis as any).DOMMatrix() }
    transformPoint(p: any) { return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: 0, w: 1 } }
    toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
    toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
  }
}
if (typeof globalThis.DOMPoint === 'undefined') {
  (globalThis as any).DOMPoint = class DOMPoint {
    x: number; y: number; z: number; w: number
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w }
    static fromPoint(p: any) { return new (globalThis as any).DOMPoint(p.x, p.y, p.z ?? 0, p.w ?? 1) }
    matrixTransform(m: any) { return m.transformPoint(this) }
  }
}
if (typeof globalThis.DOMRect === 'undefined') {
  (globalThis as any).DOMRect = class DOMRect {
    x: number; y: number; width: number; height: number
    constructor(x = 0, y = 0, w = 0, h = 0) { this.x = x; this.y = y; this.width = w; this.height = h }
    get top() { return this.y } get left() { return this.x }
    get bottom() { return this.y + this.height } get right() { return this.x + this.width }
    static fromRect(r: any) { return new (globalThis as any).DOMRect(r.x, r.y, r.width, r.height) }
  }
}

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
    const errName = err?.name ?? ''
    const errMsg = (err?.message ?? '').toLowerCase()
    const code = err?.code

    // Primary: pdfjs PasswordException (code 1 = need, code 2 = wrong)
    if (errName === 'PasswordException') {
      if (code === 2) throw new Error('PDF_WRONG_PASSWORD')
      throw new Error('PDF_NEED_PASSWORD')
    }
    // Fallback: some pdfjs builds / edge runtimes surface password errors with a
    // different class name — catch them by message string as a safety net
    if (errMsg.includes('password')) {
      if (password) throw new Error('PDF_WRONG_PASSWORD')
      throw new Error('PDF_NEED_PASSWORD')
    }

    console.error('PDF load error:', errName, err?.message)
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

async function parseChunk(chunkText: string, categories: string, billingContext: string): Promise<any[]> {
  const prompt = `Extract transactions from this bank statement. ${billingContext}

Return a JSON array with objects: { date:"YYYY-MM-DD", description:"<merchant, max 60 chars>", amount:<positive number>, type:"income"|"expense", category:"<from list>" }

- type is "income" if amount is marked (CREDIT), or is a refund/cashback/deposit; otherwise "expense"
- Skip balance summary lines (opening balance, closing balance, total)
- Skip non-transaction lines (address, account info, page headers)
- Categories: ${categories}
- Return ONLY the JSON array, no explanation

Statement:
${chunkText}`

  const completion = await groq.chat.completions.create({
    model: PDF_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Normalize CR/+ credit markers so the AI reliably identifies them as income.
// e.g. "1,500.00 CR" → "1,500.00(CREDIT)"   "+1,500.00" → "1,500.00(CREDIT)"
function normalizeCreditMarkers(line: string): string {
  // Amount followed by optional space + "CR" (case-insensitive)
  line = line.replace(/([\d,]+(?:\.\d+)?)\s+CR\b/gi, '$1(CREDIT)')
  // Leading "+" before a number
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
