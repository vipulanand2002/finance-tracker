// Settlement history, derived from what's already stored (no extra table):
//  • every split share records when it was marked paid (paid_at)
//  • every tagged transaction / payment has a created_at
//
// A "settlement round" with one person ends at the moment EVERYTHING between
// the two of you is cleared — every share paid AND the recorded amounts netting
// to zero. New activity afterwards starts the next round, which becomes its own
// separate settlement the next time it clears.
//
// Only shares BETWEEN the user and one other person count — a bill a third
// person paid is never part of the pair.

export interface HistParticipant {
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  amount_owed: number
  is_paid: boolean
  paid_at?: string | null
}

export interface HistSplit {
  id?: string
  created_by: string
  created_at?: string | null
  paid_by?: string | null
  paid_by_email?: string | null
  paid_by_name?: string | null
  split_participants: HistParticipant[]
}

/** One share between the user and another person, paid or not. */
export interface PairShare {
  /** The OTHER person in the pair */
  name: string
  email: string | null
  /** 'them' = their share on a bill you paid · 'you' = your share on a bill they paid */
  owedBy: 'them' | 'you'
  amount: number
  isPaid: boolean
  paidAt: string | null
  /** When the bill was created */
  createdAt: string | null
  splitId: string
}

export function pairShares(splits: HistSplit[], myId: string, myEmail: string): PairShare[] {
  const me = myEmail.toLowerCase()
  const isSelf = (p: HistParticipant) =>
    (!!p.participant_user_id && p.participant_user_id === myId) ||
    (!!me && p.participant_email?.toLowerCase() === me)

  const out: PairShare[] = []
  for (const s of splits) {
    const unregEmailPayer = !s.paid_by && !!s.paid_by_email
    const unregNamePayer = !s.paid_by && !s.paid_by_email && !!s.paid_by_name
    const unregPayer = unregEmailPayer || unregNamePayer
    const creditorId = s.paid_by || (unregPayer ? null : s.created_by)
    const iAmCreditor = !unregPayer && creditorId === myId
    const base = { createdAt: s.created_at ?? null, splitId: s.id ?? '' }

    if (iAmCreditor) {
      // Everyone else's share is owed to me
      for (const p of s.split_participants) {
        if (isSelf(p)) continue
        out.push({ ...base, name: p.participant_name, email: p.participant_email, owedBy: 'them', amount: p.amount_owed, isPaid: p.is_paid, paidAt: p.paid_at ?? null })
      }
    } else {
      // Someone else paid the bill — my share is owed to them
      const mine = s.split_participants.find(isSelf)
      if (!mine) continue
      let name = 'Split payer'
      let email: string | null = null
      if (unregEmailPayer) { name = s.paid_by_name ?? 'Split payer'; email = s.paid_by_email ?? null }
      else if (unregNamePayer) { name = s.paid_by_name! }
      else {
        const payer = s.split_participants.find(p => p.participant_user_id === creditorId)
        if (payer) { name = payer.participant_name; email = payer.participant_email }
      }
      out.push({ ...base, name, email, owedBy: 'you', amount: mine.amount_owed, isPaid: mine.is_paid, paidAt: mine.paid_at ?? null })
    }
  }
  return out
}

// ── Paid shares only (used for per-bill "paid on …" in the detail sheet) ──────
export interface PairPaidEvent {
  name: string
  email: string | null
  /** they_paid: their share on a bill you paid · you_paid: your share on a bill they paid */
  direction: 'they_paid' | 'you_paid'
  amount: number
  paidAt: string | null
}

export function pairPaidEvents(splits: HistSplit[], myId: string, myEmail: string): PairPaidEvent[] {
  return pairShares(splits, myId, myEmail)
    .filter(s => s.isPaid)
    .map(s => ({ name: s.name, email: s.email, direction: s.owedBy === 'them' ? 'they_paid' as const : 'you_paid' as const, amount: s.amount, paidAt: s.paidAt }))
}

// ── Settlement rounds ─────────────────────────────────────────────────────────
/** A tagged transaction / payment recorded against this person. */
export interface TaggedItem {
  /** expense: they owe you · income: they paid you · payment: you paid them (their record) · charge: they paid for you */
  kind: 'expense' | 'income' | 'payment' | 'charge'
  amount: number
  /** ISO time it was recorded */
  at: string
}

export interface SettlementRound {
  settledAt: string
  startedAt: string
  theyPaid: number
  youPaid: number
  shares: number
  splitIds: string[]
  expenses: number
  received: number
  paidToThem: number
  chargedToThem: number
}

// What each tagged item does to "they owe you" (same signs as the Balances net)
const SIGN: Record<TaggedItem['kind'], number> = { expense: 1, payment: 1, income: -1, charge: -1 }
const EPS = 0.01
const ts = (iso: string) => Date.parse(iso)
const round2 = (n: number) => Math.round(n * 100) / 100

export function buildSettlementRounds(
  shares: PairShare[],
  items: TaggedItem[],
): { rounds: SettlementRound[]; boundary: string | null } {
  type Ev = { t: number; iso: string; share?: PairShare; item?: TaggedItem }
  const events: Ev[] = []
  for (const s of shares) if (s.isPaid && s.paidAt && !isNaN(ts(s.paidAt))) events.push({ t: ts(s.paidAt), iso: s.paidAt, share: s })
  for (const it of items) if (!isNaN(ts(it.at))) events.push({ t: ts(it.at), iso: it.at, item: it })
  events.sort((a, b) => a.t - b.t)

  // Is anything still unpaid / unbalanced between the two of you at time t?
  const clearedAt = (t: number) => {
    const unpaid = shares.some(s => {
      const created = s.createdAt && !isNaN(ts(s.createdAt)) ? ts(s.createdAt) : -Infinity
      if (created > t) return false                       // bill didn't exist yet
      const paid = s.isPaid && (!s.paidAt || isNaN(ts(s.paidAt)) || ts(s.paidAt) <= t)
      return !paid
    })
    if (unpaid) return false
    const net = items.filter(i => ts(i.at) <= t).reduce((sum, i) => sum + SIGN[i.kind] * i.amount, 0)
    return Math.abs(net) < EPS
  }

  const rounds: SettlementRound[] = []
  let boundary: string | null = null
  let seg: Ev[] = []
  for (let i = 0; i < events.length; i++) {
    seg.push(events[i])
    // Evaluate only after the last event that shares this exact timestamp
    if (i + 1 < events.length && events[i + 1].t === events[i].t) continue
    if (!clearedAt(events[i].t)) continue

    const paidShares = seg.filter(e => e.share).map(e => e.share!)
    const tagged = seg.filter(e => e.item).map(e => e.item!)
    const sum = (kind: TaggedItem['kind']) => round2(tagged.filter(x => x.kind === kind).reduce((a, x) => a + x.amount, 0))
    const created = paidShares.map(s => s.createdAt).filter((c): c is string => !!c && !isNaN(ts(c)))
    const startedAt = [...created, ...seg.map(e => e.iso)].sort((a, b) => ts(a) - ts(b))[0]
    rounds.push({
      settledAt: events[i].iso,
      startedAt,
      theyPaid: round2(paidShares.filter(s => s.owedBy === 'them').reduce((a, s) => a + s.amount, 0)),
      youPaid: round2(paidShares.filter(s => s.owedBy === 'you').reduce((a, s) => a + s.amount, 0)),
      shares: paidShares.length,
      splitIds: [...new Set(paidShares.map(s => s.splitId).filter(Boolean))],
      expenses: sum('expense'),
      received: sum('income'),
      paidToThem: sum('payment'),
      chargedToThem: sum('charge'),
    })
    boundary = events[i].iso
    seg = []
  }
  return { rounds, boundary }
}
