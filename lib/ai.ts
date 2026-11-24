import { GoogleGenAI } from '@google/genai'
import type { Transaction } from '@/types'

// Gemini model used across the app (chat, insights, receipts, statements).
// Overridable via GEMINI_MODEL env so the model can change without a code deploy.
// Primary: Flash-Lite — ~500 free requests/day, high-throughput, less prone to
// 503 "high demand" than full Flash (~20/day). "-latest" alias never 404s on
// model retirement. Fallback to full Flash if Flash-Lite isn't provisioned.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash'
// Ordered, de-duped list of models to try in turn. Flash-Lite has by far the biggest free
// allowance (15 requests/min, 500/day) so it goes first; full 3.8 Flash only has 5/min and
// 20/day on the free tier, so it is the last resort. A model that 404s is skipped straight away.
// Checked with the admin AI-status tab on 24 Nov: 3.5 Flash Lite and 3 Flash Preview answered in
// under a second, while the "-latest" alias hung (504) and 3.8 Flash was overloaded — so the
// aliases go last.
const MODELS = [...new Set([GEMINI_MODEL, 'gemini-3-flash-preview', GEMINI_FALLBACK_MODEL, 'gemini-flash-lite-latest'])]

// A model that just answered 429 (over its limit) is left alone for a while, so one busy
// stretch doesn't waste the other limits on calls that are certain to fail.
const coolDown = new Map<string, number>()
const COOL_DOWN_MS = 10 * 60 * 1000
// One call to one model may not take longer than this — an overloaded model can hang
const CALL_TIMEOUT_MS = 20000

export interface GenOptions {
  /** Stop trying (and throw) once this time (ms since epoch) has passed */
  deadline?: number
  /** Cap on the answer length — small caps are cheaper for Google to serve when it is busy */
  maxOutputTokens?: number
}

// The newer models "think" before answering by default, which makes short extraction jobs slow
// and more likely to time out. Turn it off; a model that rejects the setting is remembered
// and called without it.
const thinkingRejected = new Set<string>()
// 8192 is safe across all flash / flash-lite variants; our outputs are small.
const MAX_OUTPUT_TOKENS = 8192

// Uses the current @google/genai SDK, which supports both legacy "AIza" keys and
// the newer "AQ." auth keys that Google AI Studio now issues.
function client() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenAI({ apiKey })
}

// Try each model in turn. A "busy" answer (503) is retried a couple of times with a growing
// pause, since those pass quickly; a rate-limit answer (429) means that model is used up, so
// it moves on to the next at once.
async function generate(contents: unknown, temperature: number, opts: GenOptions = {}): Promise<string> {
  const baseCfg = { temperature, maxOutputTokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS }
  let lastErr: unknown = null
  const now = Date.now()
  const available = MODELS.filter(m => (coolDown.get(m) ?? 0) <= now)
  for (const model of available.length > 0 ? available : MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (opts.deadline && Date.now() > opts.deadline - 2000) {
        throw lastErr ?? Object.assign(new Error('The AI service is taking too long to answer'), { status: 504 })
      }
      const thinkingOff = !thinkingRejected.has(model)
      const cfg = thinkingOff ? { ...baseCfg, thinkingConfig: { thinkingBudget: 0 } } : baseCfg
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = client().models.generateContent({ model, contents: contents as any, config: cfg as any })
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('The AI service is taking too long to answer'), { status: 504 })), CALL_TIMEOUT_MS)
        })
        let res
        try { res = await Promise.race([call, timeout]) } finally { clearTimeout(timer) }
        return res.text ?? ''
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.status ?? (err as any)?.code
        console.warn(`[AI] ${model} failed (attempt ${attempt + 1}): ${status ?? (err as Error)?.message}`)
        // Report the most useful failure: a "busy" / rate-limit error beats a retired-model 404
        if (!(status === 404 && lastErr)) lastErr = err
        // This model doesn't accept the no-thinking setting: remember, and retry without it
        if (status === 400 && thinkingOff) { thinkingRejected.add(model); attempt--; continue }
        // Auth / bad-request errors won't be fixed by retrying or another model
        if (status === 400 || status === 401 || status === 403) throw err
        if (status === 429) { coolDown.set(model, Date.now() + COOL_DOWN_MS); break }
        // Busy: pause and try the same model again (1.5 s, then 4 s)
        if ((status === 503 || status === 500 || status === 502) && attempt < 2) {
          await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 4000))
          continue
        }
        break // timed out, retired (404) or still busy → next model
      }
    }
  }
  throw lastErr
}

// ── Diagnostics (admin page) ───────────────────────────────────────────────────
export interface ModelProbe { model: string; ok: boolean; status?: number | string; ms: number; note?: string }

/** One tiny request to each model, to see which ones answer right now. */
export async function probeModels(models: string[]): Promise<ModelProbe[]> {
  return Promise.all(models.map(async (model): Promise<ModelProbe> => {
    const t0 = Date.now()
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('no answer in 20 s'), { status: 504 })), 20000) })
      try {
        const res = await Promise.race([client().models.generateContent({ model, contents: 'Reply with the single word OK', config: { maxOutputTokens: 8, temperature: 0 } }), timeout])
        return { model, ok: true, ms: Date.now() - t0, note: (res.text ?? '').trim().slice(0, 20) }
      } finally { clearTimeout(timer) }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      return { model, ok: false, status: e?.status ?? e?.code ?? 'error', ms: Date.now() - t0, note: String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 140) }
    }
  }))
}

/** Models the account can use that look like text models (for the admin page). */
export async function listFlashModels(): Promise<string[]> {
  const names: string[] = []
  const pager = await client().models.list()
  for await (const m of pager) {
    const n = (m.name ?? '').replace('models/', '')
    if (/flash|lite/i.test(n) && !/image|tts|live|audio|embed|vision|robot/i.test(n)) names.push(n)
    if (names.length >= 40) break
  }
  return names
}

export const AI_MODELS_IN_USE = MODELS

// Plain text prompt → text.
export async function geminiText(prompt: string, temperature = 0.2, opts?: GenOptions): Promise<string> {
  return generate(prompt, temperature, opts)
}

// Multimodal prompt (image or PDF bytes + instructions) → text.
export async function geminiVision(prompt: string, base64: string, mimeType: string, temperature = 0.1, opts?: GenOptions): Promise<string> {
  return generate([{ inlineData: { data: base64, mimeType } }, { text: prompt }], temperature, opts)
}

function buildTransactionSummary(transactions: Transaction[]): string {
  if (transactions.length === 0) return 'No transactions found.'

  const byMonth: Record<string, { income: number; expenses: number; byCategory: Record<string, number> }> = {}

  for (const t of transactions) {
    const month = t.date.substring(0, 7)
    if (!byMonth[month]) byMonth[month] = { income: 0, expenses: 0, byCategory: {} }
    if (t.type === 'income') {
      byMonth[month].income += t.amount
    } else {
      byMonth[month].expenses += t.amount
      byMonth[month].byCategory[t.category] = (byMonth[month].byCategory[t.category] || 0) + t.amount
    }
  }

  let summary = 'Monthly Transaction Summary (amounts in INR):\n'
  for (const [month, data] of Object.entries(byMonth).sort()) {
    summary += `\n${month}:\n`
    summary += `  Income: ₹${data.income.toFixed(2)}\n`
    summary += `  Expenses: ₹${data.expenses.toFixed(2)}\n`
    if (Object.keys(data.byCategory).length > 0) {
      summary += `  By category: ${Object.entries(data.byCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, amt]) => `${cat}: ₹${amt.toFixed(2)}`)
        .join(', ')}\n`
    }
  }

  return summary
}

function cleanJson(text: string): string {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

export async function analyzeSpending(transactions: Transaction[]): Promise<string[]> {
  const summary = buildTransactionSummary(transactions)

  const prompt = `You are a personal finance assistant. Analyze this spending data and provide 4-5 concise, actionable insights.

${summary}

Return a JSON array of insight strings. Each insight should be 1-2 sentences. Example format:
["You spent 40% more on dining this month compared to last month.", "Your largest expense is Rent & Housing at 35% of total spending."]

Return ONLY the JSON array, no other text.`

  try {
    const text = await geminiText(prompt)
    return JSON.parse(cleanJson(text))
  } catch (err) {
    console.error('[AI] analyzeSpending failed:', err instanceof Error ? err.message : err)
    return ['Unable to generate insights at this time.']
  }
}

export async function getBudgetRecommendations(
  transactions: Transaction[]
): Promise<{ category: string; amount: number }[]> {
  const summary = buildTransactionSummary(transactions)

  const prompt = `You are a personal finance assistant. Based on this spending history, recommend realistic monthly budget amounts in INR.

${summary}

Return a JSON array with "category" and "amount" (number, in INR). Only include expense categories visible in the data. Example:
[{"category": "Food & Dining", "amount": 4000}, {"category": "Transportation", "amount": 1500}]

Return ONLY the JSON array, no other text.`

  try {
    const text = await geminiText(prompt)
    return JSON.parse(cleanJson(text))
  } catch (err) {
    console.error('[AI] getBudgetRecommendations failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function chatWithFinanceAI(
  message: string,
  transactions: Transaction[]
): Promise<string> {
  const summary = buildTransactionSummary(transactions)

  const prompt = `You are a helpful personal finance assistant. Answer the user's question using their transaction data. All amounts are in INR (Indian Rupees).

TRANSACTION DATA (last 90 days):
${summary}

USER QUESTION: ${message}

Provide a clear, concise answer. Use specific numbers from the data when relevant. Keep it friendly and practical.`

  return geminiText(prompt)
}

export async function extractReceiptData(
  base64Image: string,
  mimeType: string
): Promise<{
  amount: number | null
  description: string | null
  category: string | null
  date: string | null
}> {
  const prompt = `Extract transaction details from this receipt. Return a JSON object with:
- amount: number (total amount, no currency symbol, null if not found)
- description: string (merchant name or brief description, null if not found)
- category: string (one of: Food & Dining, Transportation, Entertainment, Shopping, Health & Medical, Utilities, Rent & Housing, Education, Travel, Personal Care, Subscriptions, Other)
- date: string (YYYY-MM-DD format, null if not visible)

Return ONLY the JSON object, no other text.`

  try {
    const text = await geminiVision(prompt, base64Image, mimeType)
    return JSON.parse(cleanJson(text))
  } catch {
    return { amount: null, description: null, category: null, date: null }
  }
}
