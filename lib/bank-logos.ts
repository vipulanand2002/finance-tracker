const BANK_DOMAIN_MAP: [string, string][] = [
  ['hdfc', 'hdfcbank.com'],
  ['icici', 'icicibank.com'],
  ['sbi', 'sbi.co.in'],
  ['state bank', 'sbi.co.in'],
  ['axis', 'axisbank.com'],
  ['kotak', 'kotak.com'],
  ['yes bank', 'yesbank.in'],
  ['yesbank', 'yesbank.in'],
  ['indusind', 'indusind.com'],
  ['amex', 'americanexpress.com'],
  ['american express', 'americanexpress.com'],
  ['citi', 'citibank.co.in'],
  ['rbl', 'rblbank.com'],
  ['idfc', 'idfcfirstbank.com'],
  ['federal', 'federalbank.co.in'],
  ['hsbc', 'hsbc.co.in'],
  ['bank of india', 'bankofindia.co.in'],
  ['boi', 'bankofindia.co.in'],
  ['pnb', 'pnbindia.in'],
  ['punjab national', 'pnbindia.in'],
  ['bank of baroda', 'bankofbaroda.in'],
  ['bob', 'bankofbaroda.in'],
  ['canara', 'canarabank.com'],
  ['union bank', 'unionbankofindia.co.in'],
  ['standard chartered', 'sc.com'],
  ['sc bank', 'sc.com'],
  ['au bank', 'aubank.in'],
  ['au small', 'aubank.in'],
  ['bandhan', 'bandhanbank.com'],
  ['karnataka bank', 'karnatakabank.com'],
  ['dcb', 'dcbbank.com'],
  ['south indian', 'southindianbank.com'],
  ['karur vysya', 'kvb.co.in'],
  ['kvb', 'kvb.co.in'],
  ['tamilnad', 'tnmercantilebank.com'],
  ['indian bank', 'indianbank.in'],
  ['indian overseas', 'iob.in'],
  ['iob', 'iob.in'],
  ['central bank', 'centralbankofindia.co.in'],
  ['uco bank', 'ucobank.com'],
  ['paytm', 'paytmbank.com'],
  ['jupiter', 'jupiter.money'],
  ['fi money', 'fi.money'],
  ['slice', 'sliceit.com'],
  ['onecard', 'getonecard.app'],
  ['navi', 'navi.com'],
]

export function getCobrandLogoUrl(domain: string): string {
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`
}

export function getBankLogoUrl(bankName: string): string {
  const lower = bankName.toLowerCase().trim()
  for (const [keyword, domain] of BANK_DOMAIN_MAP) {
    if (lower.includes(keyword)) {
      return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`
    }
  }
  const cleaned = lower.replace(/\s*(bank|credit|card|finance).*$/i, '').trim().replace(/\s+/g, '')
  if (cleaned.length > 2) {
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${cleaned}bank.com&size=128`
  }
  return ''
}

const BANK_STATEMENT_EMAILS: [string, string][] = [
  ['hdfc', 'statements@hdfcbank.com'],
  ['icici', 'credit_cards@icicibank.com'],
  ['sbi', 'creditcard@sbi.co.in'],
  ['axis', 'statements@axisbank.com'],
  ['kotak', 'creditcards@kotak.com'],
  ['amex', 'american.express@aexp.com'],
  ['american express', 'american.express@aexp.com'],
  ['citi', 'CitibankNotification@citi.com'],
  ['yes bank', 'donotreply@yesbank.in'],
  ['indusind', 'indusindbank@indusind.com'],
  ['rbl', 'customercare@rblbank.com'],
  ['idfc', 'statements@idfcfirstbank.com'],
  ['standard chartered', 'sc@scb.co.in'],
  ['au bank', 'customercare@aubank.in'],
  ['federal', 'care@federalbank.co.in'],
  ['hsbc', 'hsbc@communication.hsbc.co.in'],
]

export function getBankStatementEmail(bankName: string): string {
  const lower = bankName.toLowerCase().trim()
  for (const [keyword, email] of BANK_STATEMENT_EMAILS) {
    if (lower.includes(keyword)) return email
  }
  return ''
}

// Network detection lives with the card artwork helpers
export { detectNetwork } from '@/lib/card-catalog'

export function formatCardDisplay(last4: string): string {
  return `•••• •••• •••• ${last4}`
}

// ── Bank lookup by free text (used by the wallet/account form) ────────────────
const BANK_DISPLAY_NAMES: Record<string, string> = {
  'hdfcbank.com': 'HDFC Bank', 'icicibank.com': 'ICICI Bank', 'sbi.co.in': 'State Bank of India',
  'axisbank.com': 'Axis Bank', 'kotak.com': 'Kotak Mahindra Bank', 'yesbank.in': 'YES Bank',
  'indusind.com': 'IndusInd Bank', 'americanexpress.com': 'American Express', 'citibank.co.in': 'Citibank',
  'rblbank.com': 'RBL Bank', 'idfcfirstbank.com': 'IDFC FIRST Bank', 'federalbank.co.in': 'Federal Bank',
  'hsbc.co.in': 'HSBC', 'bankofindia.co.in': 'Bank of India', 'pnbindia.in': 'Punjab National Bank',
  'bankofbaroda.in': 'Bank of Baroda', 'canarabank.com': 'Canara Bank', 'unionbankofindia.co.in': 'Union Bank of India',
  'sc.com': 'Standard Chartered', 'aubank.in': 'AU Small Finance Bank', 'bandhanbank.com': 'Bandhan Bank',
  'karnatakabank.com': 'Karnataka Bank', 'dcbbank.com': 'DCB Bank', 'southindianbank.com': 'South Indian Bank',
  'kvb.co.in': 'Karur Vysya Bank', 'tnmercantilebank.com': 'Tamilnad Mercantile Bank', 'indianbank.in': 'Indian Bank',
  'iob.in': 'Indian Overseas Bank', 'centralbankofindia.co.in': 'Central Bank of India', 'ucobank.com': 'UCO Bank',
  'paytmbank.com': 'Paytm Payments Bank', 'jupiter.money': 'Jupiter', 'fi.money': 'Fi Money',
  'sliceit.com': 'slice', 'getonecard.app': 'OneCard', 'navi.com': 'Navi',
}

/** Find a known bank mentioned in free text, e.g. "hdfc salary" → HDFC Bank. */
export function findBank(text: string): { institution: string; domain: string } | null {
  const lower = text.toLowerCase()
  for (const [keyword, domain] of BANK_DOMAIN_MAP) {
    // whole-word match so "axis" doesn't fire inside other words
    const re = new RegExp(`(^|[^a-z0-9])${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
    if (re.test(lower)) return { institution: BANK_DISPLAY_NAMES[domain] ?? keyword, domain }
  }
  return null
}
