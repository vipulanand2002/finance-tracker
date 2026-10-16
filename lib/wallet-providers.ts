import { getCobrandLogoUrl } from '@/lib/bank-logos'

export type AccountKind = 'wallet' | 'bank' | 'cash' | 'other'

export interface WalletProvider {
  /** Stable key stored in accounts.provider — never rename */
  key: string
  label: string
  kind: AccountKind
  /** Brand colour used for the account tile */
  color: string
  /** Domain used to fetch the logo (favicon service); none for generic kinds */
  domain?: string
}

// Popular Indian wallets and stored-value accounts, then generic kinds. To add a
// provider, append an entry; existing keys must stay the same.
export const WALLET_PROVIDERS: WalletProvider[] = [
  { key: 'amazon_pay',  label: 'Amazon Pay',          kind: 'wallet', color: '#FF9900', domain: 'amazon.in' },
  { key: 'mobikwik',    label: 'MobiKwik',            kind: 'wallet', color: '#1C5CF2', domain: 'mobikwik.com' },
  { key: 'paytm',       label: 'Paytm Wallet',        kind: 'wallet', color: '#00BAF2', domain: 'paytm.com' },
  { key: 'phonepe',     label: 'PhonePe Wallet',      kind: 'wallet', color: '#5F259F', domain: 'phonepe.com' },
  { key: 'freecharge',  label: 'Freecharge',          kind: 'wallet', color: '#F26722', domain: 'freecharge.in' },
  { key: 'airtel',      label: 'Airtel Payments Bank', kind: 'wallet', color: '#E40000', domain: 'airtel.in' },
  { key: 'ola_money',   label: 'Ola Money',           kind: 'wallet', color: '#1A1A2E', domain: 'olacabs.com' },
  { key: 'pluxee',      label: 'Pluxee (Sodexo)',     kind: 'wallet', color: '#00A3A1', domain: 'pluxee.in' },
  { key: 'zeta',        label: 'Zeta',                kind: 'wallet', color: '#6A3CE0', domain: 'zeta.tech' },
  { key: 'upi_lite',    label: 'UPI Lite',            kind: 'wallet', color: '#097939', domain: 'npci.org.in' },
  { key: 'fastag',      label: 'FASTag',              kind: 'wallet', color: '#0B5394', domain: 'ihmcl.co.in' },
  { key: 'gift_card',   label: 'Gift card',           kind: 'wallet', color: '#DB2777' },
  { key: 'other_wallet', label: 'Other wallet',       kind: 'wallet', color: '#64748B' },
  { key: 'bank',        label: 'Bank account',        kind: 'bank',   color: '#2563EB' },
  { key: 'cash',        label: 'Cash',                kind: 'cash',   color: '#16A34A' },
  { key: 'other',       label: 'Other account',       kind: 'other',  color: '#64748B' },
]

export const KIND_LABEL: Record<AccountKind, string> = {
  wallet: 'Wallet',
  bank: 'Bank account',
  cash: 'Cash',
  other: 'Other',
}

export function getProvider(key: string | null | undefined): WalletProvider | null {
  return WALLET_PROVIDERS.find(p => p.key === key) ?? null
}

export function providerLogoUrl(key: string | null | undefined): string | null {
  const p = getProvider(key)
  return p?.domain ? getCobrandLogoUrl(p.domain) : null
}

// ── Balances ──────────────────────────────────────────────────────────────────
export interface Account {
  id: string
  user_id: string
  name: string
  kind: AccountKind
  provider: string | null
  opening_balance: number
  color: string | null
  notes: string | null
  is_archived: boolean
  created_at: string
  /** Brand / bank name identified for this account, e.g. 'HDFC Bank' (migration 047) */
  institution?: string | null
  /** Domain used to fetch the logo (migration 047) */
  logo_domain?: string | null
}

export interface AccountTransfer {
  id: string
  from_account_id: string | null
  to_account_id: string | null
  amount: number
  date: string
  note: string | null
  created_at: string
}

export interface AccountWithBalance extends Account {
  balance: number
  income: number
  expenses: number
  transfersIn: number
  transfersOut: number
  transactionCount: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Current balance of each account from its opening balance, transactions and transfers. */
export function computeBalances(
  accounts: Account[],
  txs: { account_id: string | null; amount: number; type: string }[],
  transfers: Pick<AccountTransfer, 'from_account_id' | 'to_account_id' | 'amount'>[],
): AccountWithBalance[] {
  return accounts.map(a => {
    const own = txs.filter(t => t.account_id === a.id)
    const income = own.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const expenses = own.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const transfersIn = transfers.filter(t => t.to_account_id === a.id).reduce((s, t) => s + Number(t.amount), 0)
    const transfersOut = transfers.filter(t => t.from_account_id === a.id).reduce((s, t) => s + Number(t.amount), 0)
    return {
      ...a,
      opening_balance: Number(a.opening_balance) || 0,
      income: r2(income),
      expenses: r2(expenses),
      transfersIn: r2(transfersIn),
      transfersOut: r2(transfersOut),
      balance: r2((Number(a.opening_balance) || 0) + income - expenses + transfersIn - transfersOut),
      transactionCount: own.length,
    }
  })
}
