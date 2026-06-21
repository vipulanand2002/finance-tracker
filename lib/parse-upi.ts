import type { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './constants'

export type TxType = 'expense' | 'income'

export interface ParsedUpiTx {
  amount: number | null
  type: TxType | null
  description: string
  category: string
  date: string
  raw: string
}

// ── Amount extraction ───────────────────────────────────────────────────────
const AMOUNT_RE = [
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
]

function parseAmount(text: string): number | null {
  for (const re of AMOUNT_RE) {
    const m = text.match(re)
    if (m) return parseFloat(m[1].replace(/,/g, ''))
  }
  return null
}

// ── Debit / Credit ──────────────────────────────────────────────────────────
const DEBIT_KW = [
  'debited', 'deducted', 'paid to', 'payment of', 'payment to',
  'transferred to', 'sent to', 'withdrawn', 'purchase', 'spent',
  'you paid', 'you have paid', 'you have transferred',
]
const CREDIT_KW = [
  'credited', 'received', 'added to', 'deposited', 'refund', 'cashback',
  'you received', 'has been credited',
]

function detectType(lower: string): TxType | null {
  const isDebit = DEBIT_KW.some((k) => lower.includes(k))
  const isCredit = CREDIT_KW.some((k) => lower.includes(k))
  if (isDebit && !isCredit) return 'expense'
  if (isCredit && !isDebit) return 'income'
  if (isDebit) return 'expense'
  return null
}

// ── Merchant extraction ─────────────────────────────────────────────────────
const MERCHANT_RE = [
  // "paid to MERCHANT", "payment to MERCHANT"
  /(?:paid to|payment to|transferred to|sent to)\s+([A-Za-z0-9][A-Za-z0-9\s&'.,-]{1,35}?)(?:\s+(?:via|on|for|ref|upi|\.|,)|$)/i,
  // "at MERCHANT" pattern (ICICI, HDFC)
  /at\s+([A-Z][A-Za-z0-9\s&'.]{1,30}?)(?:\s+(?:via|on|ref|upi|\.|,)|$)/i,
  // VPA handle pattern (UPI ID like merchant@upi)
  /(?:to|credited by|from)\s+([a-z0-9._-]+@[a-z]+)/i,
]

function extractMerchant(text: string): string {
  for (const re of MERCHANT_RE) {
    const m = text.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

// ── Date extraction ─────────────────────────────────────────────────────────
const DATE_RE = [
  // DD-MM-YY or DD/MM/YY or DD-MM-YYYY
  /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/,
  // DD-Mon-YY  e.g. 21-Jun-26
  /(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/,
  // Mon DD, YYYY  e.g. Jun 21, 2026
  /([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/,
]
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function parseDate(text: string): string {
  const today = new Date().toISOString().split('T')[0]

  // DD-Mon-YY
  const m2 = text.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/)
  if (m2) {
    const day = parseInt(m2[1], 10)
    const mon = MONTHS[m2[2].toLowerCase()] ?? 1
    let yr = parseInt(m2[3], 10)
    if (yr < 100) yr += 2000
    return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Mon DD, YYYY
  const m3 = text.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/)
  if (m3) {
    const mon = MONTHS[m3[1].toLowerCase()] ?? 1
    const day = parseInt(m3[2], 10)
    const yr = parseInt(m3[3], 10)
    return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // DD/MM/YY or DD-MM-YYYY
  const m1 = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m1) {
    const day = parseInt(m1[1], 10)
    const mon = parseInt(m1[2], 10)
    let yr = parseInt(m1[3], 10)
    if (yr < 100) yr += 2000
    return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return today
}

// ── Category guess ───────────────────────────────────────────────────────────
type ExpCat = typeof EXPENSE_CATEGORIES[number]
type IncCat = typeof INCOME_CATEGORIES[number]

const CAT_MAP: Array<{ re: RegExp; expense: ExpCat; income: IncCat }> = [
  { re: /swiggy|zomato|food|restaurant|cafe|pizza|burger|mcdonalds|kfc|dominos|biryani|dhaba|hotel/i, expense: 'Food & Dining', income: 'Other' },
  { re: /uber|ola|metro|bus|train|rapido|auto|cab|petrol|diesel|fuel|parking|namma yatri/i, expense: 'Transportation', income: 'Other' },
  { re: /amazon|flipkart|myntra|meesho|ajio|nykaa|shopping|mart|supermarket|grocery|bigbasket|blinkit|zepto|instamart/i, expense: 'Shopping', income: 'Other' },
  { re: /airtel|jio|vi|vodafone|bsnl|recharge|broadband|electricity|water|gas|bill/i, expense: 'Utilities', income: 'Other' },
  { re: /netflix|spotify|prime|hotstar|zee5|disney|youtube|gaming|game|playgame/i, expense: 'Subscriptions', income: 'Other' },
  { re: /hospital|clinic|pharmacy|medical|health|doctor|apollo|medplus|medicine/i, expense: 'Health & Medical', income: 'Other' },
  { re: /rent|housing|society|maintenance|landlord/i, expense: 'Rent & Housing', income: 'Rental Income' },
  { re: /salary|stipend|payroll/i, expense: 'Other', income: 'Salary' },
  { re: /freelance|project|client payment/i, expense: 'Other', income: 'Freelance' },
  { re: /refund|reversal|cashback/i, expense: 'Refund', income: 'Refund' },
  { re: /travel|flight|hotel|oyo|airbnb|booking|makemytrip|goibibo|irctc/i, expense: 'Travel', income: 'Other' },
  { re: /school|college|tuition|course|udemy|fees/i, expense: 'Education', income: 'Other' },
]

function guessCategory(desc: string, smsLower: string, type: TxType | null): string {
  const haystack = `${desc} ${smsLower}`
  for (const { re, expense, income } of CAT_MAP) {
    if (re.test(haystack)) return type === 'income' ? income : expense
  }
  return 'Other'
}

// ── Main export ──────────────────────────────────────────────────────────────
export function parseUpiSms(text: string): ParsedUpiTx {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  const type = detectType(lower)
  const merchant = extractMerchant(text)
  const description = merchant || (type === 'income' ? 'UPI Credit' : 'UPI Payment')
  const date = parseDate(text)
  const category = guessCategory(description, lower, type)

  return { amount, type, description, category, date, raw: text }
}
