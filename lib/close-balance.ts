// Which split shares does "Close Balance" with ONE person settle?
// Only the shares that are between the two people:
//   • bills the user paid        → the other person's unpaid share
//   • bills the other person paid → the user's unpaid share
// A bill paid by a THIRD person is never touched — that debt isn't between the pair.

export interface CloseParticipant {
  id: string
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  is_paid: boolean
}

export interface CloseSplit {
  id: string
  created_by: string
  paid_by?: string | null
  paid_by_email?: string | null
  paid_by_name?: string | null
  split_participants: CloseParticipant[]
}

export interface ClosePair {
  userId: string
  userEmail: string
  /** The other person's email (lowercased) or null for a name-only contact */
  email: string | null
  name: string
  /** The other person's account id when they're registered */
  theirId: string | null
}

export function selectPairShares(splits: CloseSplit[], pair: ClosePair): { id: string; split_id: string }[] {
  const nameLower = pair.name.trim().toLowerCase()
  const myEmail = pair.userEmail.toLowerCase()

  const isThem = (p: CloseParticipant) => pair.email
    ? p.participant_email?.toLowerCase() === pair.email
    : !p.participant_email && p.participant_name.trim().toLowerCase() === nameLower
  const isMe = (p: CloseParticipant) =>
    p.participant_user_id === pair.userId || (!!myEmail && p.participant_email?.toLowerCase() === myEmail)

  const out: { id: string; split_id: string }[] = []
  for (const s of splits) {
    // An unregistered payer (email-only or name-only) is never the author
    const unregPayer = !s.paid_by && !!(s.paid_by_email || s.paid_by_name)
    const iAmCreditor = !unregPayer && (s.paid_by || s.created_by) === pair.userId
    const theyAreCreditor = s.paid_by
      ? !!pair.theirId && s.paid_by === pair.theirId
      : s.paid_by_email
        ? !!pair.email && s.paid_by_email.toLowerCase() === pair.email
        : s.paid_by_name
          ? !pair.email && s.paid_by_name.trim().toLowerCase() === nameLower
          : false

    const rows = iAmCreditor
      ? s.split_participants.filter(p => !p.is_paid && isThem(p))
      : theyAreCreditor
        ? s.split_participants.filter(p => !p.is_paid && isMe(p))
        : [] // a third party paid — not settled by this pair
    for (const p of rows) out.push({ id: p.id, split_id: s.id })
  }
  return out
}
