// Settlement history, derived from what's already stored: every split share
// records when it was marked paid (paid_at). Only shares BETWEEN the user and
// one other person count — a bill a third person paid is never part of the pair.

export interface HistParticipant {
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  amount_owed: number
  is_paid: boolean
  paid_at?: string | null
}

export interface HistSplit {
  created_by: string
  paid_by?: string | null
  paid_by_email?: string | null
  paid_by_name?: string | null
  split_participants: HistParticipant[]
}

export interface PairPaidEvent {
  /** The OTHER person in the pair */
  name: string
  email: string | null
  /** they_paid: their share on a bill you paid · you_paid: your share on a bill they paid */
  direction: 'they_paid' | 'you_paid'
  amount: number
  paidAt: string | null
}

export function pairPaidEvents(splits: HistSplit[], myId: string, myEmail: string): PairPaidEvent[] {
  const me = myEmail.toLowerCase()
  const isSelf = (p: HistParticipant) =>
    (!!p.participant_user_id && p.participant_user_id === myId) ||
    (!!me && p.participant_email?.toLowerCase() === me)

  const out: PairPaidEvent[] = []
  for (const s of splits) {
    const unregEmailPayer = !s.paid_by && !!s.paid_by_email
    const unregNamePayer = !s.paid_by && !s.paid_by_email && !!s.paid_by_name
    const unregPayer = unregEmailPayer || unregNamePayer
    const creditorId = s.paid_by || (unregPayer ? null : s.created_by)
    const iAmCreditor = !unregPayer && creditorId === myId

    if (iAmCreditor) {
      // Everyone else's share that has been paid = they paid me
      for (const p of s.split_participants) {
        if (isSelf(p) || !p.is_paid) continue
        out.push({ name: p.participant_name, email: p.participant_email, direction: 'they_paid', amount: p.amount_owed, paidAt: p.paid_at ?? null })
      }
    } else {
      // Someone else paid the bill — my paid share = I paid them
      const mine = s.split_participants.find(isSelf)
      if (!mine || !mine.is_paid) continue
      let name = 'Split payer'
      let email: string | null = null
      if (unregEmailPayer) { name = s.paid_by_name ?? 'Split payer'; email = s.paid_by_email ?? null }
      else if (unregNamePayer) { name = s.paid_by_name! }
      else {
        const payer = s.split_participants.find(p => p.participant_user_id === creditorId)
        if (payer) { name = payer.participant_name; email = payer.participant_email }
      }
      out.push({ name, email, direction: 'you_paid', amount: mine.amount_owed, paidAt: mine.paid_at ?? null })
    }
  }
  return out
}
