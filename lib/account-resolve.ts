import { WALLET_PROVIDERS, type AccountKind } from '@/lib/wallet-providers'
import { findBank } from '@/lib/bank-logos'

// What we know about an account from the name the user typed.
export interface AccountIdentity {
  kind: AccountKind
  /** Key from WALLET_PROVIDERS when it's one we already ship (keeps old accounts compatible) */
  provider: string | null
  /** Official brand / bank name, when identifiable */
  institution: string | null
  /** Website domain used to fetch the logo */
  domain: string | null
  /** Brand colour #RRGGBB */
  color: string | null
  /** A bank account where we couldn't tell which bank — ask for the bank name */
  needsInstitution: boolean
  source: 'known' | 'ai'
}

// Extra spellings for providers we ship (label and key are matched automatically).
const ALIASES: Record<string, string[]> = {
  amazon_pay: ['amazonpay', 'amzn pay'],
  phonepe: ['phone pe'],
  mobikwik: ['mobi kwik'],
  freecharge: ['free charge'],
  pluxee: ['sodexo'],
  upi_lite: ['upilite'],
}

const clean = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\bwallet\b/g, ' ').replace(/\s+/g, ' ').trim()

function hasWord(text: string, word: string) {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(text)
}

/** Instant, offline match for names we already know — no AI call needed. */
export function resolveKnown(text: string): AccountIdentity | null {
  const lower = text.toLowerCase().trim()
  if (lower.length < 2) return null

  // A named bank: "HDFC salary", "SBI savings", "Paytm Payments Bank"
  const mentionsBank = hasWord(lower, 'bank')
  const bank = findBank(lower)

  // Known wallets (unless the text clearly says it's a bank account)
  if (!(mentionsBank && bank)) {
    for (const p of WALLET_PROVIDERS) {
      if (p.kind !== 'wallet' || !p.domain) continue
      const names = [clean(p.label), p.key.replace(/_/g, ' '), ...(ALIASES[p.key] ?? [])]
      if (names.some(n => n && hasWord(lower, n))) {
        return { kind: 'wallet', provider: p.key, institution: p.label.replace(/\s*\(.*?\)/, ''), domain: p.domain, color: p.color, needsInstitution: false, source: 'known' }
      }
    }
  }

  if (bank) {
    return { kind: 'bank', provider: 'bank', institution: bank.institution, domain: bank.domain, color: null, needsInstitution: false, source: 'known' }
  }
  if (/gift ?card|voucher/.test(lower)) {
    return { kind: 'wallet', provider: 'gift_card', institution: null, domain: null, color: '#DB2777', needsInstitution: false, source: 'known' }
  }
  // Physical cash only when that's ALL it says ("Cash", "Cash in hand") — "Zepto Cash" is a wallet
  if (/^(my\s+)?(cash|physical cash|cash in (my )?(hand|wallet|pocket)|cash on hand|pocket( money| cash)?|purse)$/.test(lower)) {
    return { kind: 'cash', provider: 'cash', institution: null, domain: null, color: '#16A34A', needsInstitution: false, source: 'known' }
  }
  // Clearly a bank account, but no bank named → ask which bank
  if (/\b(bank|savings?|salary|current account|fixed deposit|fd)\b/.test(lower)) {
    return { kind: 'bank', provider: 'bank', institution: null, domain: null, color: '#2563EB', needsInstitution: true, source: 'known' }
  }
  return null
}

/** Validate / normalise whatever the AI returned so a bad answer can't reach the UI. */
export function sanitizeIdentity(raw: unknown): AccountIdentity | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind: AccountKind = (['wallet', 'bank', 'cash', 'other'] as const).includes(r.kind as AccountKind) ? (r.kind as AccountKind) : 'other'
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  let domain = str(r.domain, 80)?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? null
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) domain = null
  const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color.toUpperCase() : null
  const institution = str(r.institution, 60)
  return {
    kind,
    provider: kind === 'bank' ? 'bank' : kind === 'cash' ? 'cash' : null,
    institution,
    domain,
    color,
    needsInstitution: kind === 'bank' && !institution && r.needsInstitution !== false,
    source: 'ai',
  }
}
