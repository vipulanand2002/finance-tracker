import { GoogleGenAI } from '@google/genai'
import type { Transaction } from '@/types'

// Gemini model used across the app (chat, insights, receipts, statements).
// Overridable via GEMINI_MODEL env so the model can change without a code deploy.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
// Secondary model tried when the primary is overloaded (503) or unavailable (404).
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash'
// Ordered, de-duped list of models to try in turn.
const MODELS = [...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL])]
// Generous cap: gemini-3.x flash is a thinking model that counts its internal
// reasoning against this budget, so a small value can truncate the real output.
const MAX_OUTPUT_TOKENS = 65536

// Uses the current @google/genai SDK, which supports both legacy "AIza" keys and
// the newer "AQ." auth keys that Google AI Studio now issues.
function client() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenAI({ apiKey })
}

// Try each model in turn, retrying transient errors (429 rate limit, 5xx /
// "high demand") on the same model before falling through to the next one.
// gemini-3.x flash can return 503 during demand spikes, so the fallback model
// keeps chat/insights working when the primary is momentarily saturated.
async function generate(contents: unknown, temperature: number): Promise<string> {
  const cfg = { temperature, maxOutputTokens: MAX_OUTPUT_TOKENS }
  let lastErr: unknown = null
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await client().models.generateContent({ model, contents: contents as any, config: cfg })
        return res.text ?? ''
      } catch (err) {
        lastErr = err
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.status ?? (err as any)?.code
        // Auth / bad-request errors won't be fixed by retrying or another model
        if (status === 400 || status === 401 || status === 403) throw err
        const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504
        if (transient && attempt < 1) {
          await new Promise(r => setTimeout(r, 700)) // brief backoff, then retry same model
          continue
        }
        break // exhausted this model (or 404 unavailable) → try the next one
      }
    }
  }
  throw lastErr
}

// Plain text prompt → text.
export async function geminiText(prompt: string, temperature = 0.2): Promise<string> {
  return generate(prompt, temperature)
}

// Multimodal prompt (image or PDF bytes + instructions) → text.
export async function geminiVision(prompt: string, base64: string, mimeType: string, temperature = 0.1): Promise<string> {
  return generate([{ inlineData: { data: base64, mimeType } }, { text: prompt }], temperature)
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
