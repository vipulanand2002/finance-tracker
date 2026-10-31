import { parseUpiSms, type TxType } from './parse-upi'

// Smart parser for pasted bank / card / wallet / UPI messages. Understands credit &
// debit card purchases, card refunds, card bill payments (received on the card, or
// debited from a bank account towards a card / via CRED), bank-account debits and
// credits, and wallet messages. Pure and synchronous — the AI fallback
// (/api/ai/parse-sms) returns the same shape when this can't make sense of a message.

export type SmsInstrument = 'credit_card' | 'debit_card' | 'card' | 'account' | 'wallet' | 'upi'
export type SmsKind = 'purchase' | 'refund' | 'card_payment' | 'debit' | 'credit'

export interface ParsedSms {
  amount: number | null
  type: TxType | null
  kind: SmsKind | null
  instrument: SmsInstrument | null
  description: string
  category: string
  date: string
  /** Last 4 digits of the card in the message, if any */
  cardLast4: string | null
  /** Last 4 digits of the bank account in the message, if any */
  accountLast4: string | null
  /** Bank or card issuer named in the message, e.g. 'HDFC' */
  bank: string | null
  /** Wallet provider key (lib/wallet-providers.ts) named in the message */
  wallet: string | null
  /** Things the user should know before saving (OTP, declined, bill reminder…) */
  warnings: string[]
  /** 'low' when the amount or direction couldn't be worked out — worth asking AI */
  confidence: 'high' | 'low'
  raw: string
}

// ── Amount ──────────────────────────────────────────────────────────────────
const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)(?![a-z])/gi
// Figures that are NOT the transaction amount when they come right before it
const NOT_AMOUNT_BEFORE = /(avl|avbl|avail|available|bal|balance|limit|lmt|outstanding|total\s+(?:amt\s+)?due|min(?:imum)?\.?\s+(?:amt\s+)?due|amount\s+due|due\s+amt)[^\d₹]{0,12}$/i

export function pickAmount(text: string): number | null {
  for (const m of text.matchAll(AMOUNT_RE)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0)
    if (NOT_AMOUNT_BEFORE.test(before)) continue
    const n = parseFloat((m[1] ?? m[2]).replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// ── Card / account numbers ──────────────────────────────────────────────────
// Banks mask numbers ("XX1234", "**1234", "ending 1234", "no. xx1234"). Requiring a
// mask/"ending" keeps us from grabbing an amount like "card for Rs 1234".
const MASK = String.raw`(?:[x*•.]{2,}\s*|ending(?:\s+(?:with|in))?\s*[x*•]*\s*|no\.?\s*[x*•]*\s*|number\s*[x*•]*\s*)`
const CARD4_RE = new RegExp(String.raw`(?:card|\bcc\b)[^\d\n]{0,30}?${MASK}(\d{4})(?!\d)`, 'i')
const ACCT4_RE = new RegExp(String.raw`(?:a\/c|a\/c\.|acct|account|\bac\b)[^\d\n]{0,20}?(?:${MASK})?(\d{4})(?!\d)`, 'i')

// ── Banks / issuers (canonical short names, matched against card.bank_name) ────
const BANKS: [RegExp, string][] = [
  [/\bhdfc\b/i, 'HDFC'], [/\bicici\b/i, 'ICICI'], [/\bsbi\b|state bank/i, 'SBI'], [/\baxis\b/i, 'Axis'],
  [/\bkotak\b/i, 'Kotak'], [/\bamex\b|american express/i, 'Amex'], [/\bindusind\b/i, 'IndusInd'],
  [/\byes\s?bank\b/i, 'Yes Bank'], [/\brbl\b/i, 'RBL'], [/\bidfc\b/i, 'IDFC'], [/\bau\s+(?:small|bank)/i, 'AU'],
  [/\bfederal\b/i, 'Federal'], [/\bhsbc\b/i, 'HSBC'], [/standard chartered|\bsc\s?bank\b/i, 'Standard Chartered'],
  [/\bciti(?:bank)?\b/i, 'Citi'], [/\bbob\b|bank of baroda|bobcard/i, 'Bank of Baroda'], [/\bonecard\b/i, 'OneCard'],
  [/\bpnb\b|punjab national/i, 'PNB'], [/\bcanara\b/i, 'Canara'], [/union bank/i, 'Union Bank'],
  [/\bidbi\b/i, 'IDBI'], [/\bslice\b/i, 'Slice'], [/\bscapia\b/i, 'Scapia'], [/\bjupiter\b/i, 'Jupiter'],
]

const WALLETS: [RegExp, string][] = [
  [/amazon\s?pay/i, 'amazon_pay'], [/mobikwik/i, 'mobikwik'], [/paytm\s+(?:wallet|balance)/i, 'paytm'],
  [/phonepe\s+wallet/i, 'phonepe'], [/freecharge/i, 'freecharge'], [/ola\s?money/i, 'ola_money'],
  [/pluxee|sodexo/i, 'pluxee'], [/upi\s?lite/i, 'upi_lite'], [/fastag/i, 'fastag'],
]

// ── Date ────────────────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100

export function parseSmsDate(text: string, today = new Date()): string {
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
  let m: RegExpMatchArray | null
  // 2026-10-31
  if ((m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)) && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3])
  // 31-Oct-26 · 31 Oct 2026 · 31Oct26 · 31-OCT-2026
  if ((m = text.match(/\b(\d{1,2})[\s-]?([a-z]{3})[a-z]*[\s,-]?(\d{2,4})\b/i)) && MONTHS[m[2].toLowerCase()]) {
    const y = fullYear(+m[3]), mo = MONTHS[m[2].toLowerCase()], d = +m[1]
    if (valid(y, mo, d)) return iso(y, mo, d)
  }
  // Oct 31, 2026
  if ((m = text.match(/\b([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/i)) && MONTHS[m[1].toLowerCase()]) {
    const y = +m[3], mo = MONTHS[m[1].toLowerCase()], d = +m[2]
    if (valid(y, mo, d)) return iso(y, mo, d)
  }
  // 31/10/26 · 31-10-2026 (Indian day-first)
  if ((m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/))) {
    const d = +m[1], mo = +m[2], y = fullYear(+m[3])
    if (valid(y, mo, d)) return iso(y, mo, d)
  }
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

// ── Merchant ────────────────────────────────────────────────────────────────
const MERCHANT_RES = [
  /\bInfo:?\s*([A-Za-z0-9][\w&'.*\- ]{1,40}?)(?=\s*(?:\.|,|;|avl|avbl|bal|ref|on\s+\d|$))/i,
  /\bat\s+([A-Za-z0-9][\w&'.*\- ]{1,40}?)(?=\s+(?:on|via|ref|using|txn|avl|avbl)\b|\s*[.,;]|\s*$)/i,
  /\b(?:spent|used|charged)\b[^.]*?\bon\s+([A-Za-z][\w&'.*\- ]{1,40}?)(?=\s+(?:on|at)\s+\d|\s*[.,;]|\s*$)/i,
  /\b(?:to|towards|for)\s+(?:VPA\s+)?([A-Za-z0-9][\w&'.@*\- ]{1,40}?)(?=\s+(?:on|via|ref|upi|from)\b|\s*[.,;]|\s*$)/i,
]
const JUNK_MERCHANT = /^(?:your|the|a\/c|account|card|credit card|debit card|rs|inr|txn|transaction|upi|ref|on|date)\b/i

function extractMerchant(text: string): string {
  for (const re of MERCHANT_RES) {
    const m = text.match(re)
    const v = m?.[1]?.trim().replace(/[*\s]+$/, '').replace(/\s{2,}/g, ' ')
    if (v && v.length >= 2 && !JUNK_MERCHANT.test(v) && !/^\d+$/.test(v)) return v
  }
  return ''
}

// ── Kinds ───────────────────────────────────────────────────────────────────
const OTP_RE = /\botp\b|one[\s-]time password|verification code|do not share/i
const DECLINED_RE = /\bdeclined\b|\bfailed\b|unsuccessful|could not be processed|insufficient/i
const REMINDER_RE = /\b(?:total|min(?:imum)?)\.?\s+(?:amt\s+|amount\s+)?due\b|payment\s+due|due\s+(?:date|by|on)\b|statement\s+(?:for|of|is\s+generated|generated)/i
// (?:[^.]|\.\d) = within one sentence, but not stopped by an amount's decimal point
const CARD_PAYMENT_RE = /payment\b(?:[^.]|\.\d){0,40}\b(?:received|credited|successful|processed)|(?:received|credited)\b(?:[^.]|\.\d){0,30}\bpayment|thank(?:s| you) for (?:the |your )?payment|\bbill\s*(?:payment|paid)\b|\bvia\s+cred\b|\bcred\b|towards\s+(?:your\s+)?(?:\w+\s+){0,3}(?:credit\s+)?card/i
const REFUND_RE = /\brefund(?:ed)?\b|\breversal\b|\breversed\b|\bcashback\b/i
const CARD_DEBIT_RE = /\bspent\b|\bused\b|\bcharged\b|\bpurchase\b|\bdebited\b|\btxn of\b|\btransaction of\b|\bpaid\b|\bwithdrawn\b/i
const CREDIT_RE = /\bcredited\b|\breceived\b|\bdeposited\b|\badded\b/i
const DEBIT_RE = /\bdebited\b|\bdeducted\b|\bpaid\b|\bsent\b|\btransferred\b|\bwithdrawn\b|\bspent\b|\bpurchase\b/i

export function parseSms(text: string, today = new Date()): ParsedSms {
  const raw = text
  const t = text.replace(/\s+/g, ' ').trim()
  const lower = t.toLowerCase()
  const warnings: string[] = []

  const isCreditCard = /credit\s*card|\bcc\b|creditcard/i.test(t)
  const isDebitCard = /debit\s*card/i.test(t)
  const cardLast4 = t.match(CARD4_RE)?.[1] ?? null
  // An account number only counts when it isn't the card's own number
  const acctMatch = t.match(ACCT4_RE)?.[1] ?? null
  const accountLast4 = acctMatch && acctMatch !== cardLast4 ? acctMatch : null
  const mentionsCard = isCreditCard || isDebitCard || !!cardLast4 || /\bcard\b/i.test(t)
  const bank = BANKS.find(([re]) => re.test(t))?.[1] ?? null
  const wallet = WALLETS.find(([re]) => re.test(t))?.[1] ?? null

  const amount = pickAmount(t)

  let kind: SmsKind | null = null
  let type: TxType | null = null
  let instrument: SmsInstrument | null = null

  if (mentionsCard && CARD_PAYMENT_RE.test(t) && !(isDebitCard && !isCreditCard)) {
    // Paying a credit card's bill — received on the card, or sent from a bank account
    kind = 'card_payment'; type = 'expense'; instrument = 'credit_card'
  } else if (mentionsCard && REFUND_RE.test(t)) {
    kind = 'refund'; type = 'income'; instrument = isDebitCard ? 'debit_card' : isCreditCard ? 'credit_card' : 'card'
  } else if (mentionsCard && CARD_DEBIT_RE.test(t) && !(accountLast4 && !cardLast4 && !isCreditCard)) {
    kind = 'purchase'; type = 'expense'; instrument = isDebitCard ? 'debit_card' : isCreditCard ? 'credit_card' : 'card'
  } else {
    // Bank account / wallet / UPI — fall back to the UPI parser's direction
    const upi = parseUpiSms(t)
    type = upi.type
    if (REFUND_RE.test(t)) type = 'income'
    else if (!type) type = CREDIT_RE.test(t) && !DEBIT_RE.test(t) ? 'income' : DEBIT_RE.test(t) ? 'expense' : null
    kind = type === 'income' ? 'credit' : type === 'expense' ? 'debit' : null
    instrument = wallet ? 'wallet' : accountLast4 ? 'account' : /\bupi\b|vpa|@/i.test(t) ? 'upi' : null
  }

  if (OTP_RE.test(t)) warnings.push('This looks like an OTP message, not a transaction.')
  if (DECLINED_RE.test(t)) warnings.push('The message says the transaction was declined or failed.')
  if (REMINDER_RE.test(t) && kind !== 'card_payment') {
    warnings.push('This looks like a bill or statement reminder — add the payment once you’ve paid.')
  }

  const upi = parseUpiSms(t)
  const merchant = kind === 'card_payment' ? '' : extractMerchant(t)
  const category =
    kind === 'card_payment' ? 'Card Payment'
    : kind === 'refund' ? 'Refund'
    : parseUpiSms(`${merchant} ${lower}`).category || upi.category || 'Other'

  const description =
    kind === 'card_payment' ? `Card bill payment${bank ? ` · ${bank}` : ''}${cardLast4 ? ` ••${cardLast4}` : ''}`
    : merchant || (kind === 'refund' ? 'Card refund' : kind === 'purchase' ? 'Card purchase' : upi.description)

  return {
    amount,
    type,
    kind,
    instrument,
    description,
    category,
    date: parseSmsDate(t, today),
    cardLast4,
    accountLast4,
    bank,
    wallet,
    warnings,
    confidence: amount != null && type != null ? 'high' : 'low',
    raw,
  }
}

// ── Matching to the user's own cards & accounts ───────────────────────────────
export interface MatchableCard { id: string; card_name: string; bank_name: string; last_four: string | null; card_type?: string }
export interface MatchableAccount { id: string; name: string; kind: string; provider: string | null; institution?: string | null; notes?: string | null; is_archived?: boolean }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const bankMatches = (bank: string | null, ...names: (string | null | undefined)[]) =>
  !!bank && names.some(n => {
    const a = norm(n), b = norm(bank)
    return !!a && !!b && (a.includes(b) || b.includes(a.slice(0, Math.max(3, b.length))))
  })

export type MatchHow = 'last4' | 'bank' | 'wallet' | null

/** Which of the user's cards the message is about: exact last-4 first, then the only card from that bank. */
export function matchCard(p: ParsedSms, cards: MatchableCard[]): { card: MatchableCard | null; how: MatchHow } {
  if (p.kind !== 'purchase' && p.kind !== 'refund' && p.kind !== 'card_payment') return { card: null, how: null }
  // Debit-card spending comes out of a bank account — it isn't credit-card spending
  if (p.instrument === 'debit_card') return { card: null, how: null }
  const credit = cards.filter(c => (c.card_type ?? 'credit') === 'credit')
  if (p.cardLast4) {
    const exact = credit.filter(c => c.last_four === p.cardLast4)
    if (exact.length === 1) return { card: exact[0], how: 'last4' }
    if (exact.length > 1) {
      const byBank = exact.filter(c => bankMatches(p.bank, c.bank_name, c.card_name))
      if (byBank.length === 1) return { card: byBank[0], how: 'last4' }
    }
  }
  const sameBank = credit.filter(c => bankMatches(p.bank, c.bank_name, c.card_name))
  if (sameBank.length === 1 && (!p.cardLast4 || !sameBank[0].last_four)) return { card: sameBank[0], how: 'bank' }
  return { card: null, how: null }
}

/** Which wallet / bank account the money moved through: wallet provider, then the last 4 in notes, then the only account at that bank. */
export function matchAccount(p: ParsedSms, accounts: MatchableAccount[]): { account: MatchableAccount | null; how: MatchHow } {
  const active = accounts.filter(a => !a.is_archived)
  // A card purchase or refund is on the card — not from an account
  if (p.kind === 'purchase' || p.kind === 'refund') {
    if (p.instrument !== 'debit_card') return { account: null, how: null }
  }
  if (p.wallet) {
    const w = active.filter(a => a.provider === p.wallet)
    if (w.length === 1) return { account: w[0], how: 'wallet' }
  }
  if (p.accountLast4) {
    const byDigits = active.filter(a => (a.notes ?? '').includes(p.accountLast4!) || a.name.includes(p.accountLast4!))
    if (byDigits.length === 1) return { account: byDigits[0], how: 'last4' }
  }
  const banks = active.filter(a => a.kind === 'bank' && bankMatches(p.bank, a.institution, a.name))
  if (banks.length === 1 && (p.accountLast4 || p.instrument === 'debit_card' || p.kind === 'card_payment')) {
    return { account: banks[0], how: 'bank' }
  }
  return { account: null, how: null }
}
