// Reads transaction rows straight from statement text, without AI. Used when the AI service
// is busy or over its limit, so an import still gives a list the user can review and edit.
//
// Input is the extracted statement text: one table row per line, cells separated by tabs
// (see extractPdfText). A row counts as a transaction when it has a date, a description and
// a money amount with two decimals; summary / header rows are skipped.

export interface RuleTransaction {
  date: string // YYYY-MM-DD
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

// 16/10/2026 · 16-10-26 · 16.10.2026 · 16 Oct 2026 · 16-Oct-26 · 16 Oct
const DATE_RE = /(\d{1,2})[\/\-. ]\s?(\d{1,2}|[A-Za-z]{3,9})(?:[\/\-. ,]\s?(\d{4}|\d{2}))?(?!\d)/

const SKIP_ROW = /(statement\s*(date|period|summary)|payment\s*due|due\s*date|minimum\s*(amount|payment)|total\s*(amount|dues?|debits?|credits?|purchases?)|opening\s*balance|closing\s*balance|previous\s*balance|credit\s*limit|available\s*(credit|limit)|reward\s*points|points\s*summary|page\s*\d|gstin|invoice|customer\s*(id|name)|card\s*(no|number)|billing\s*cycle|date\s*of\s*birth|e-?statement)/i
const SKIP_DESC = /^(date|description|particulars|narration|details|transaction|amount|debit|credit|balance|reference|sr\.?\s*no|s\.?\s*no)\b/i
const CREDIT_WORDS = /(payment\s*(received|-?\s*thank)|thank\s*you|refund|reversal|reversed|cashback|credit\s*adjust|neft\s*cr|upi\s*cr|bbps\s*payment|autopay|auto\s*debit\s*payment)/i

const CATEGORY_RULES: [RegExp, string][] = [
  [/(swiggy|zomato|dominos|domino'?s|mc\s?donald|mcdonald|kfc|burger|pizza|cafe|coffee|starbucks|restaurant|bakery|kitchen|biryani|dhaba|eats|food|dining|barbeque|haldiram|subway|chai|fasos|bar\b)/i, 'Food & Dining'],
  [/(uber|ola\b|olacabs|rapido|metro|irctc|redbus|fastag|petrol|fuel|hpcl|bpcl|iocl|indian\s?oil|shell|parking|toll|cab\b)/i, 'Transportation'],
  [/(makemytrip|goibibo|cleartrip|yatra|indigo|air\s?india|vistara|akasa|spicejet|airline|hotel|oyo|booking\.com|agoda|airbnb|resort|holiday)/i, 'Travel'],
  [/(netflix|spotify|hotstar|prime\s*video|youtube|apple\.com|google\s*play|icloud|subscription|zee5|sonyliv|jiosaavn)/i, 'Subscriptions'],
  [/(bookmyshow|pvr|inox|cinema|movie|gaming|steam|playstation|xbox)/i, 'Entertainment'],
  [/(amazon|flipkart|myntra|ajio|nykaa|meesho|tata\s*cliq|croma|reliance\s*(retail|digital|smart)|dmart|big\s?basket|bigbasket|blinkit|zepto|instamart|lifestyle|westside|decathlon|ikea|mall|store|mart\b|retail)/i, 'Shopping'],
  [/(pharmacy|pharma|apollo|medplus|1mg|netmeds|hospital|clinic|diagnostic|lab\b|medical|health|dental|doctor)/i, 'Health & Medical'],
  [/(electricity|bescom|tneb|msedcl|water\s*bill|gas|broadband|airtel|jio\b|vodafone|vi\b|bsnl|recharge|dth|tata\s*play|bill\s*pay|utility|postpaid)/i, 'Utilities'],
  [/(school|college|university|tuition|course|udemy|coursera|byju|unacademy|exam|fees?\b)/i, 'Education'],
  [/(salon|spa\b|beauty|cosmetic|parlour|parlor|grooming|barber)/i, 'Personal Care'],
  [/(rent\b|maintenance|society|housing)/i, 'Rent & Housing'],
]

function categorise(description: string, income: boolean): string {
  if (income) return /refund|reversal|reversed|cashback/i.test(description) ? 'Refund' : 'Card Payment'
  for (const [re, cat] of CATEGORY_RULES) if (re.test(description)) return cat
  return 'Other'
}

function pad(n: number) { return String(n).padStart(2, '0') }

/** The year most often written in full in the text — used when a row's date has no year. */
function commonYear(text: string): number {
  const counts = new Map<number, number>()
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) counts.set(+m[1], (counts.get(+m[1]) ?? 0) + 1)
  let best = new Date().getFullYear()
  let n = 0
  for (const [y, c] of counts) if (c > n) { best = y; n = c }
  return best
}

function toIso(d: string, m: string, y: string | undefined, fallbackYear: number): string | null {
  const day = +d
  let month = /^\d+$/.test(m) ? +m : MONTHS[m.slice(0, 3).toLowerCase()]
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null
  let year = y ? (y.length === 2 ? 2000 + +y : +y) : fallbackYear
  if (year < 2000 || year > 2100) return null
  const iso = `${year}-${pad(month)}-${pad(day)}`
  // Reject impossible dates like 31 Feb
  const t = new Date(iso + 'T00:00:00Z')
  if (isNaN(t.getTime()) || t.getUTCDate() !== day) return null
  return iso
}

// An amount such as 1,234.50 — always with two decimals, so reward points and ids don't match
const AMOUNT_RE = /(\+|-)?\s*(?:₹|Rs\.?|INR|C(?=\s*\d))?\s*(\d{1,3}(?:,\d{2,3})+|\d+)\.(\d{2})(?!\d)(?:\s*(CR|DR|Cr|Dr|C|D)(?![A-Za-z0-9]))?/g

export function parseStatementByRules(rawText: string): RuleTransaction[] {
  const fallbackYear = commonYear(rawText)
  const out: RuleTransaction[] = []

  for (const rawLine of rawText.split('\n')) {
    if (rawLine.trim() === '<<PAGE_BREAK>>') continue
    const line = rawLine.replace(/\t+/g, '  ').replace(/\|/g, ' ').replace(/\s{3,}/g, '  ').trim()
    if (line.length < 8 || SKIP_ROW.test(line)) continue

    // The row must start with a date (allowing a serial number before it)
    const dm = DATE_RE.exec(line)
    if (!dm || dm.index > 12) continue
    const date = toIso(dm[1], dm[2], dm[3], fallbackYear)
    if (!date) continue

    let rest = line.slice(dm.index + dm[0].length)
    // A second date in the row (e.g. "statement period 01/10 to 31/10") isn't a transaction
    if (/\bto\b/i.test(rest) && DATE_RE.test(rest.replace(/^.*\bto\b/i, ''))) continue

    // Amounts: the last one on the row is the transaction amount
    const amounts = [...rest.matchAll(AMOUNT_RE)]
    if (amounts.length === 0) continue
    const last = amounts[amounts.length - 1]
    const amount = parseFloat(`${last[2].replace(/,/g, '')}.${last[3]}`)
    if (!(amount > 0)) continue

    const before = rest.slice(0, last.index)
    // Credit if marked + / Cr / C (SBI style), or written "(CREDIT)" right after the amount
    const isCreditMark = last[1] === '+' || /^c/i.test(last[4] ?? '') || /\(CREDIT\)/.test(rest.slice(last.index! + last[0].length, last.index! + last[0].length + 10))
    // Description: what's between the date and the first amount, without times, ids and points
    let description = (amounts.length > 1 ? rest.slice(0, amounts[0].index) : before)
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
      .replace(/\b\d{8,}\b/g, ' ')        // long reference numbers
      .replace(/[+-]\s*\d{1,5}\b/g, ' ')  // reward points like "+ 20"
      .replace(/\s+\d{1,5}\s*$/, ' ')      // a points column left at the end
      .replace(/\b(Rs\.?|INR|C)\s*$/i, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    description = description.replace(/^[\s.\-:,/]+|[\s.\-:,/]+$/g, '').slice(0, 60)
    if (description.replace(/[^A-Za-z]/g, '').length < 3 || SKIP_DESC.test(description)) continue

    const income = isCreditMark || CREDIT_WORDS.test(description)
    out.push({ date, description, amount, type: income ? 'income' : 'expense', category: categorise(description, income) })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date))
}
