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

export interface CardTheme {
  gradient: { from: string; to: string; text: string }
  cobrandDomain?: string
  cobrandName?: string
}

// keywords (lowercase) → theme. Order matters: more specific first.
const CARD_THEME_MAP: [string[], CardTheme][] = [
  // ── Co-branded cards ──────────────────────────────────────────────────
  [['amazon pay', 'amazon'],       { gradient: { from: '#0F1111', to: '#FF9900', text: '#fff' }, cobrandDomain: 'amazon.in',       cobrandName: 'Amazon Pay' }],
  [['flipkart'],                   { gradient: { from: '#2874F0', to: '#F9A825', text: '#fff' }, cobrandDomain: 'flipkart.com',     cobrandName: 'Flipkart' }],
  [['tata neu', 'tataneu'],        { gradient: { from: '#3B0082', to: '#7B2FBE', text: '#fff' }, cobrandDomain: 'tataneu.com',      cobrandName: 'Tata Neu' }],
  [['zomato'],                     { gradient: { from: '#CC0000', to: '#E23744', text: '#fff' }, cobrandDomain: 'zomato.com',       cobrandName: 'Zomato' }],
  [['swiggy'],                     { gradient: { from: '#C4410C', to: '#FC8019', text: '#fff' }, cobrandDomain: 'swiggy.com',       cobrandName: 'Swiggy' }],
  [['ola money', 'ola '],          { gradient: { from: '#1A1A2E', to: '#16213E', text: '#fff' }, cobrandDomain: 'olacabs.com',      cobrandName: 'Ola' }],
  [['makemytrip', 'mmt'],          { gradient: { from: '#006D77', to: '#00B4CC', text: '#fff' }, cobrandDomain: 'makemytrip.com',   cobrandName: 'MakeMyTrip' }],
  [['irctc'],                      { gradient: { from: '#003087', to: '#0057A8', text: '#fff' }, cobrandDomain: 'irctc.co.in',      cobrandName: 'IRCTC' }],
  [['indigo', '6e '],              { gradient: { from: '#1A0050', to: '#3C0078', text: '#fff' }, cobrandDomain: 'goindigo.in',      cobrandName: 'IndiGo' }],
  [['air india'],                  { gradient: { from: '#8B0000', to: '#CC0000', text: '#fff' }, cobrandDomain: 'airindia.com',     cobrandName: 'Air India' }],
  [['vistara'],                    { gradient: { from: '#4B0082', to: '#8B00FF', text: '#fff' }, cobrandDomain: 'airvistara.com',   cobrandName: 'Vistara' }],
  [['bookmyshow', 'bms'],          { gradient: { from: '#AA0022', to: '#CC0033', text: '#fff' }, cobrandDomain: 'bookmyshow.com',   cobrandName: 'BookMyShow' }],
  [['myntra'],                     { gradient: { from: '#FF3F6C', to: '#FF6B98', text: '#fff' }, cobrandDomain: 'myntra.com',       cobrandName: 'Myntra' }],
  [['nykaa'],                      { gradient: { from: '#FC2779', to: '#FF6BAE', text: '#fff' }, cobrandDomain: 'nykaa.com',        cobrandName: 'Nykaa' }],
  [['paytm'],                      { gradient: { from: '#002970', to: '#00BAF2', text: '#fff' }, cobrandDomain: 'paytm.com',        cobrandName: 'Paytm' }],
  [['byju', 'byjus'],              { gradient: { from: '#1435C3', to: '#3358FF', text: '#fff' }, cobrandDomain: 'byjus.com',        cobrandName: "BYJU'S" }],
  [['uber'],                       { gradient: { from: '#000000', to: '#1A1A1A', text: '#fff' }, cobrandDomain: 'uber.com',         cobrandName: 'Uber' }],
  [['ixigo'],                      { gradient: { from: '#FF6600', to: '#FF8C00', text: '#fff' }, cobrandDomain: 'ixigo.com',        cobrandName: 'ixigo' }],

  // ── Premium HDFC cards ─────────────────────────────────────────────────
  [['infinia'],                    { gradient: { from: '#0A0A0A', to: '#2C2C2C', text: '#D4AF37' } }],
  [['regalia gold'],               { gradient: { from: '#1A0050', to: '#6A1E9A', text: '#FFD700' } }],
  [['regalia'],                    { gradient: { from: '#1A0050', to: '#4B0082', text: '#C9A84C' } }],
  [['diners club', 'diners'],      { gradient: { from: '#0A0A0A', to: '#1C1C1C', text: '#C0C0C0' } }],
  [['millennia'],                  { gradient: { from: '#6A0DAD', to: '#9B30FF', text: '#fff' } }],
  [['moneyback'],                  { gradient: { from: '#006400', to: '#228B22', text: '#fff' } }],
  [['swad'],                       { gradient: { from: '#B8860B', to: '#DAA520', text: '#fff' } }],

  // ── Premium Axis cards ─────────────────────────────────────────────────
  [['magnus'],                     { gradient: { from: '#0A0A1E', to: '#1A1A3E', text: '#C0C0C0' } }],
  [['reserve'],                    { gradient: { from: '#0D0D0D', to: '#2D2D2D', text: '#D4AF37' } }],
  [['burgundy'],                   { gradient: { from: '#3D0000', to: '#6B0000', text: '#F5C518' } }],
  [['vistara axis', 'atlas'],      { gradient: { from: '#4B0082', to: '#7B2FBE', text: '#fff' } }],
  [['my zone', 'myzone'],          { gradient: { from: '#1D4E89', to: '#2874A6', text: '#fff' } }],
  [['ace'],                        { gradient: { from: '#1A1A2E', to: '#16213E', text: '#00BFFF' } }],

  // ── Premium ICICI cards ────────────────────────────────────────────────
  [['emeralde'],                   { gradient: { from: '#004d00', to: '#007700', text: '#FFD700' } }],
  [['sapphiro'],                   { gradient: { from: '#003366', to: '#0057A8', text: '#C9A84C' } }],
  [['rubyx'],                      { gradient: { from: '#8B0000', to: '#B22222', text: '#fff' } }],
  [['coral'],                      { gradient: { from: '#FF6347', to: '#FF7F50', text: '#fff' } }],
  [['platinum'],                   { gradient: { from: '#808080', to: '#A9A9A9', text: '#fff' } }],

  // ── SBI premium ────────────────────────────────────────────────────────
  [['sbi prime', 'prime'],         { gradient: { from: '#003087', to: '#0047AB', text: '#FFD700' } }],
  [['simplyclick', 'simply click'],{ gradient: { from: '#CC4400', to: '#FF6600', text: '#fff' } }],
  [['simplysave', 'simply save'],  { gradient: { from: '#1A6B1A', to: '#228B22', text: '#fff' } }],
  [['elite'],                      { gradient: { from: '#0D0D0D', to: '#2C2C2C', text: '#C0C0C0' } }],

  // ── Kotak premium ──────────────────────────────────────────────────────
  [['league'],                     { gradient: { from: '#6B0000', to: '#AA0000', text: '#FFD700' } }],
  [['811'],                        { gradient: { from: '#C0392B', to: '#E74C3C', text: '#fff' } }],

  // ── Yes Bank ───────────────────────────────────────────────────────────
  [['yes first'],                  { gradient: { from: '#003366', to: '#004D99', text: '#C9A84C' } }],

  // ── Standard Chartered ─────────────────────────────────────────────────
  [['ultimate'],                   { gradient: { from: '#0A0A0A', to: '#1C1C1C', text: '#00C851' } }],
  [['smart'],                      { gradient: { from: '#007A4D', to: '#00A86B', text: '#fff' } }],
]

export function getCardTheme(cardName: string): CardTheme | null {
  const lower = cardName.toLowerCase()
  for (const [keywords, theme] of CARD_THEME_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return theme
  }
  return null
}

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

export function detectNetwork(cardNumber: string): 'visa' | 'mastercard' | 'rupay' | 'amex' | 'other' {
  const digits = cardNumber.replace(/\D/g, '')
  if (!digits) return 'other'
  if (digits.startsWith('4')) return 'visa'
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^6/.test(digits)) return 'rupay'
  return 'other'
}

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
