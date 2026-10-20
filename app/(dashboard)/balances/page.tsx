'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import { fetchProfileNames } from '@/lib/profile-names'
import { pairShares, buildPersonHistory, type PairShare, type TaggedItem, type SettlementRound, type SettlementRecord } from '@/lib/settlement-history'
import { format, formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, Loader2, Send, X, Plus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

const TransactionModal = dynamic(() => import('@/components/transactions/TransactionModal'), { ssr: false })
const BalanceDetailSheet = dynamic(() => import('@/components/balances/BalanceDetailSheet'), { ssr: false })
import type { BalanceCounterparty } from '@/components/balances/BalanceDetailSheet'

interface Participant {
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  amount_owed: number
  is_paid: boolean
  paid_at?: string | null
}

interface SplitRow {
  id?: string
  created_at?: string | null
  created_by: string
  paid_by?: string | null
  paid_by_email?: string | null
  paid_by_name?: string | null
  is_settled: boolean
  split_participants: Participant[]
}

interface TaggedPayment {
  id: string
  from_user_id: string
  from_name: string | null
  from_email: string | null
  amount: number
  description: string | null
  date: string
  created_at?: string
  status: string         // pending | added | dismissed
  kind?: string          // 'payment' (they paid you) | 'charge' (you paid for them)
}

interface FriendBalance {
  key: string            // stable unique id for React/state (contact id, else email/name)
  id: string | null      // contact id if this counterparty is a saved friend
  name: string
  email: string | null
  splitOwed: number      // they owe you (splits you created)
  splitYouOwe: number    // you owe them (splits they created)
  txnOwed: number        // expense tagged to them
  txnReceived: number    // income tagged from them
  paidToThem: number     // payments THEY recorded that you made to them (reduces what you owe)
  chargedToThem: number  // charges THEY recorded that you owe them (they paid for you)
  net: number            // positive = they owe you, negative = you owe them
  /** When the balance with this person was last fully settled. Tagged amounts recorded
   *  before this belong to earlier, closed rounds — so they're not counted again. */
  since: string | null
  /** When the current (open) round began — earliest unsettled bill or entry. */
  roundStart: string | null
}

// One settlement with one person. The same person can have several (one per round).
interface SettledEntry {
  key: string            // unique per settlement
  personKey: string      // the person (FriendBalance.key) this settlement belongs to
  cp: { name: string; email: string | null; id: string | null }
  round: SettlementRound
  no: number             // 1-based index of this settlement for the person
  of: number             // how many settlements the person has in total
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<FriendBalance[]>([])
  const [settled, setSettled] = useState<SettledEntry[]>([])   // every past settlement, newest first
  // false until migration 045 (settlements table) has been applied
  const [settlementsAvailable, setSettlementsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)  // contact id pending confirmation
  const [closing, setClosing] = useState<string | null>(null)
  const [addExpenseFor, setAddExpenseFor] = useState<FriendBalance | null>(null)
  const [detailFor, setDetailFor] = useState<BalanceCounterparty | null>(null)  // open balance detail

  const load = useCallback(async () => {
    {
      setLoading(true)
      try {
        const { createClient } = require('@/lib/supabase/client') as typeof import('@/lib/supabase/client')
        const { data: { user } } = await createClient().auth.getUser()
        const myId = user?.id ?? ''
        const myEmail = (user?.email ?? '').toLowerCase()

        const [friendsRes, splitsRes, payRes, settleRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/splits'),
          fetch('/api/tagged-payments'),
          fetch('/api/settlements'),
        ])
        const friends = await friendsRes.json()
        const splits = await splitsRes.json()
        const settleData = settleRes.ok ? await settleRes.json() : { available: false, rows: [] }
        setSettlementsAvailable(!!settleData.available)
        const settleRecords: SettlementRecord[] = Array.isArray(settleData.rows) ? settleData.rows : []
        const paymentsData = payRes.ok ? await payRes.json() : []
        const friendList: { id: string; name: string; email: string | null }[] = Array.isArray(friends) ? friends : []
        const splitList: SplitRow[] = Array.isArray(splits) ? splits : []
        const payList: TaggedPayment[] = Array.isArray(paymentsData) ? paymentsData : []

        // Build counterparties keyed by email (or name when no email), pulling from
        // both the friends list and every split participant/creator.
        const map = new Map<string, FriendBalance>()
        const keyOf = (email: string | null, name: string) =>
          email ? `e:${email.toLowerCase()}` : `n:${name.toLowerCase()}`
        const ensure = (name: string, email: string | null, id?: string | null): FriendBalance => {
          const key = keyOf(email, name)
          let cp = map.get(key)
          if (!cp) {
            cp = { key, id: id ?? null, name, email: email ?? null, splitOwed: 0, splitYouOwe: 0, txnOwed: 0, txnReceived: 0, paidToThem: 0, chargedToThem: 0, net: 0, since: null, roundStart: null }
            map.set(key, cp)
          } else {
            if (!cp.id && id) cp.id = id
            if (!cp.email && email) cp.email = email
          }
          return cp
        }

        const isSelf = (p: Participant) =>
          (!!p.participant_user_id && p.participant_user_id === myId) ||
          (!!myEmail && p.participant_email?.toLowerCase() === myEmail)

        // Seed with saved friends so tagged transactions can be attributed to them
        for (const f of friendList) ensure(f.name, f.email, f.id)

        for (const sp of splitList) {
          if (sp.is_settled) continue
          // The person who PAID the bill is the creditor. Registered → paid_by
          // (user id). Unregistered (email-only payer) → paid_by_email/name, in
          // which case the author (created_by) is NOT the creditor.
          const unregPayerEmail = !sp.paid_by && sp.paid_by_email ? sp.paid_by_email.toLowerCase() : null
          // Name-only payer (no account, no email) — attributed by name.
          const unregPayerName = !sp.paid_by && !sp.paid_by_email && sp.paid_by_name ? sp.paid_by_name : null
          const unregPayer = !!unregPayerEmail || !!unregPayerName
          const creditorId = sp.paid_by || (unregPayer ? null : sp.created_by)
          const iAmCreditor = !!myId && creditorId === myId && !unregPayer
          if (iAmCreditor) {
            // Everyone else's unpaid share is owed TO me
            for (const p of sp.split_participants ?? []) {
              if (p.is_paid || isSelf(p)) continue
              ensure(p.participant_name, p.participant_email).splitOwed += p.amount_owed
            }
          } else {
            // I only participate → my unpaid share is what I owe the payer
            const myRow = (sp.split_participants ?? []).find(isSelf)
            if (myRow && !myRow.is_paid) {
              if (unregPayerEmail) {
                // Unregistered payer with an email — attribute by their email/name
                ensure(sp.paid_by_name ?? 'Split payer', sp.paid_by_email ?? null).splitYouOwe += myRow.amount_owed
              } else if (unregPayerName) {
                // Name-only payer — attribute by name
                ensure(unregPayerName, null).splitYouOwe += myRow.amount_owed
              } else {
                const payer = (sp.split_participants ?? []).find(p => p.participant_user_id === creditorId)
                ensure(payer?.participant_name ?? 'Split payer', payer?.participant_email ?? null)
                  .splitYouOwe += myRow.amount_owed
              }
            }
          }
        }

        // Records the friend created from transactions they tagged to me:
        //   'payment' → I paid them (reduces what I owe)
        //   'charge'  → they paid for me (increases what I owe)
        // (All statuses count; status only controls the notification banner.)
        // Keep the raw records per person: the settlement rounds (below) decide which
        // of them belong to a closed round and which are fresh since the last one.
        const rawPays = new Map<string, TaggedPayment[]>()
        for (const pay of payList) {
          const cp = ensure(pay.from_name ?? pay.from_email ?? 'Friend', pay.from_email ?? null)
          rawPays.set(cp.key, [...(rawPays.get(cp.key) ?? []), pay])
        }

        // Every share between the two of you (paid or not), grouped per person
        const sharesByKey = new Map<string, PairShare[]>()
        for (const sh of pairShares(splitList, myId, myEmail)) {
          const cp = ensure(sh.name, sh.email)
          sharesByKey.set(cp.key, [...(sharesByKey.get(cp.key) ?? []), sh])
        }

        // Tagged (non-split) transactions only exist for saved friends (need contact_id)
        interface RawTxn { type: string; amount: number; split_id: string | null; created_at?: string; date: string }
        const rawTxns = new Map<string, RawTxn[]>()
        await Promise.all(
          [...map.values()].filter(cp => cp.id).map(async cp => {
            const txRes = await fetch(`/api/transactions?contact_id=${cp.id}`)
            const txns = txRes.ok ? await txRes.json() : []
            const txList: RawTxn[] = Array.isArray(txns) ? txns : txns.transactions ?? []
            rawTxns.set(cp.key, txList.filter(t => !t.split_id))
          })
        )

        // Each person's settlements: the ones you recorded by closing a balance, plus
        // (for older history) rounds worked out from timestamps — a round closes when
        // every share is paid AND the recorded amounts net to zero. Anything after the
        // latest settlement is a fresh round (back in Active) that becomes its own entry
        // the next time it's settled.
        const atOf = (x: { created_at?: string; date: string }) => x.created_at ?? `${x.date}T00:00:00Z`
        const recordsByKey = new Map<string, SettlementRecord[]>()
        for (const r of settleRecords) recordsByKey.set(r.person_key, [...(recordsByKey.get(r.person_key) ?? []), r])
        const entries: SettledEntry[] = []
        for (const cp of map.values()) {
          const items: TaggedItem[] = [
            ...(rawTxns.get(cp.key) ?? [])
              .filter(t => t.type === 'expense' || t.type === 'income')
              .map(t => ({ kind: t.type as 'expense' | 'income', amount: t.amount, at: atOf(t) })),
            ...(rawPays.get(cp.key) ?? [])
              .map(p => ({ kind: (p.kind === 'charge' ? 'charge' : 'payment') as 'charge' | 'payment', amount: p.amount, at: atOf(p) })),
          ]
          const { rounds, boundary } = buildPersonHistory(sharesByKey.get(cp.key) ?? [], items, recordsByKey.get(cp.key) ?? [])
          cp.since = boundary
          // Active numbers only count what was recorded after the last settlement
          // (earlier amounts belong to the closed rounds, even if a settlement left
          // something over — settling is an agreement, not necessarily a payment).
          const after = boundary ? Date.parse(boundary) : -Infinity
          const fresh = items.filter(i => Date.parse(i.at) > after)
          const openStarts = [
            ...(sharesByKey.get(cp.key) ?? []).filter(s => !(s.isPaid && s.paidAt && Date.parse(s.paidAt) <= after)).map(s => s.createdAt),
            ...fresh.map(i => i.at),
          ].filter((x): x is string => !!x).sort((a, b) => Date.parse(a) - Date.parse(b))
          cp.roundStart = openStarts[0] ?? null
          const total = (kind: TaggedItem['kind']) => fresh.filter(i => i.kind === kind).reduce((s, i) => s + i.amount, 0)
          cp.txnOwed = total('expense')
          cp.txnReceived = total('income')
          cp.paidToThem = total('payment')
          cp.chargedToThem = total('charge')
          rounds.forEach((round, i) => entries.push({
            key: `${cp.key}|${round.settledAt}`,
            personKey: cp.key,
            cp: { name: cp.name, email: cp.email, id: cp.id },
            round, no: i + 1, of: rounds.length,
          }))
        }

        // Resolve display names: keep my own nickname for saved contacts; for
        // everyone else fall back to the person's own profile name over the
        // creator-typed name that came from a split/payment.
        const names = await fetchProfileNames([...map.values()].map(cp => cp.email))
        for (const cp of map.values()) {
          if (!cp.id && cp.email) {
            const pn = names.get(cp.email.toLowerCase())
            if (pn) cp.name = pn
          }
        }

        const result = [...map.values()].map(cp => ({
          ...cp,
          net: cp.splitOwed + cp.txnOwed + cp.paidToThem - cp.splitYouOwe - cp.txnReceived - cp.chargedToThem,
        }))

        // Active = something is still outstanding with that person right now.
        const outstanding = (b: FriendBalance) =>
          Math.abs(b.net) > 0.009 || b.splitOwed > 0.009 || b.splitYouOwe > 0.009

        setBalances(result.filter(outstanding).sort((a, b) => b.net - a.net))
        // Settled = every past settlement, newest first. The names are resolved by
        // now, so refresh them on the entries too.
        const nameByKey = new Map(result.map(r => [r.key, r.name]))
        setSettled(
          entries
            .map(e => ({ ...e, cp: { ...e.cp, name: nameByKey.get(e.personKey) ?? e.cp.name } }))
            .sort((a, b) => Date.parse(b.round.settledAt) - Date.parse(a.round.settledAt))
        )
      } finally {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Closing a balance is an AGREEMENT that you're settled — not a payment. It never
  // creates income or expense: it settles the splits between you two and records the
  // settlement, so everything recorded up to now belongs to the closed round.
  async function closeBalance(friend: FriendBalance) {
    setConfirmClose(null)
    const round2 = (n: number) => Math.round(n * 100) / 100

    // Anything outside the splits (tagged amounts, recorded payments) can only be
    // closed by recording the settlement, which needs the settlements table.
    const leftover = round2(friend.txnOwed - friend.txnReceived + friend.paidToThem - friend.chargedToThem)
    if (!settlementsAvailable && Math.abs(leftover) > 0.009) {
      toast.error('One-time setup needed to settle this: run migration 045 (settlements table) in Supabase, then try again.')
      return
    }

    setClosing(friend.key)
    try {
      const res = await fetch('/api/splits?type=close_balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_email: friend.email,
          contact_name: friend.name,
          person_key: friend.key,
          contact_id: friend.id,
          net_before: friend.net,
          started_at: friend.roundStart,
          tagged: {
            expenses: friend.txnOwed,
            received: friend.txnReceived,
            paid_to_them: friend.paidToThem,
            charged_to_them: friend.chargedToThem,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const splitsClosed: number = data.settledSplits ?? 0

      toast.success(
        splitsClosed > 0
          ? `Settled with ${friend.name} · ${splitsClosed} split${splitsClosed !== 1 ? 's' : ''} marked settled`
          : `Settled with ${friend.name}`
      )
      await load()
    } catch {
      toast.error('Failed to close balance')
    } finally {
      setClosing(null)
    }
  }

  async function remind(friend: FriendBalance) {
    if (!friend.email || !friend.id) { toast.error('Add an email to this friend to send reminders'); return }
    setReminding(friend.key)
    try {
      const res = await fetch('/api/mail/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', contact_id: friend.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'no_pending_splits') toast.info(`No pending splits to remind ${friend.name} about`)
        else toast.error(data.error ?? 'Failed to send reminder')
        return
      }
      toast.success(`Reminder sent to ${friend.name}`)
    } catch {
      toast.error('Failed to send reminder')
    } finally {
      setReminding(null)
    }
  }

  const totalOwedToYou = balances.filter(b => b.net > 0).reduce((s, b) => s + b.net, 0)
  const totalYouOwe = balances.filter(b => b.net < 0).reduce((s, b) => s + Math.abs(b.net), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Balances</h1>
        <p className="text-muted-foreground text-sm">Net amounts across splits and tagged transactions</p>
      </div>

      {/* Summary strip */}
      {!loading && balances.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:max-w-xl">
          <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 px-4 py-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Friends owe you</p>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{formatCurrency(totalOwedToYou)}</p>
          </div>
          <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 px-4 py-3">
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">You owe friends</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">{formatCurrency(totalYouOwe)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({balances.length})</TabsTrigger>
          <TabsTrigger value="settled">Settled ({settled.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
      {balances.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="font-medium">All settled up</p>
          <p className="text-sm mt-1">No outstanding balances with any friends</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {balances.map(b => (
            <div key={b.key} className="rounded-xl border bg-card p-4 space-y-3">

              {/* Row 1: avatar + name (left)  |  net amount (right) — tap to open detail */}
              <div className="flex items-center gap-3 cursor-pointer" role="button" tabIndex={0}
                onClick={() => setDetailFor({ name: b.name, email: b.email, contactId: b.id, since: b.since })}>
                <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight hover:underline">{b.name}</p>
                  {b.email && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.email}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {b.net > 0 ? (
                    <>
                      <div className="flex items-center justify-end gap-1 text-emerald-600 font-bold text-base leading-tight">
                        <ArrowUpRight className="w-4 h-4" />{formatCurrency(b.net)}
                      </div>
                      <p className="text-xs text-muted-foreground">owes you</p>
                    </>
                  ) : b.net < 0 ? (
                    <>
                      <div className="flex items-center justify-end gap-1 text-blue-600 font-bold text-base leading-tight">
                        <ArrowDownLeft className="w-4 h-4" />{formatCurrency(Math.abs(b.net))}
                      </div>
                      <p className="text-xs text-muted-foreground">you owe</p>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-600 text-sm">
                      <CheckCircle2 className="w-4 h-4" />Settled
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: breakdown chips */}
              {(b.splitOwed > 0 || b.splitYouOwe > 0 || b.txnOwed > 0 || b.txnReceived > 0 || b.paidToThem > 0 || b.chargedToThem > 0) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {b.splitOwed     > 0 && <span>They owe (splits): <span className="font-medium text-foreground">{formatCurrency(b.splitOwed)}</span></span>}
                  {b.splitYouOwe   > 0 && <span>You owe (splits): <span className="font-medium text-foreground">{formatCurrency(b.splitYouOwe)}</span></span>}
                  {b.paidToThem    > 0 && <span>You paid: <span className="font-medium text-foreground">{formatCurrency(b.paidToThem)}</span></span>}
                  {b.chargedToThem > 0 && <span>They paid for you: <span className="font-medium text-foreground">{formatCurrency(b.chargedToThem)}</span></span>}
                  {b.txnOwed       > 0 && <span>Expenses: <span className="font-medium text-foreground">{formatCurrency(b.txnOwed)}</span></span>}
                  {b.txnReceived   > 0 && <span>Received: <span className="font-medium text-foreground">{formatCurrency(b.txnReceived)}</span></span>}
                </div>
              )}

              {/* Row 3: action buttons */}
              {(b.net > 0 || b.splitOwed > 0 || !!b.id) && confirmClose !== b.key && (
                <div className="flex gap-2 justify-end pt-1 border-t flex-wrap">
                  {b.id && (
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5"
                      onClick={() => setAddExpenseFor(b)}>
                      <Plus className="w-3 h-3" />Add expense
                    </Button>
                  )}
                  {b.net > 0 && (
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5"
                      disabled={reminding === b.key || !b.email} onClick={() => remind(b)}>
                      {reminding === b.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Remind
                    </Button>
                  )}
                  {b.net > 0 && (
                    <Button size="sm" variant="outline"
                      className="h-8 px-3 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      disabled={closing === b.key} onClick={() => setConfirmClose(b.key)}>
                      {closing === b.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Close Balance
                    </Button>
                  )}
                </div>
              )}

              {/* Inline confirm */}
              {confirmClose === b.key && (
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t">
                  <p className="text-xs text-muted-foreground">
                    Settle your balance with <span className="font-medium text-foreground">{b.name}</span>? Marks the splits between you two as paid (both ways), settles any split that ends up fully paid, and clears anything else so the balance lands on zero.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-8 px-3 text-xs gap-1" onClick={() => setConfirmClose(null)}>
                      <X className="w-3 h-3" />Cancel
                    </Button>
                    <Button size="sm" className="h-8 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => closeBalance(b)}>
                      <CheckCircle2 className="w-3 h-3" />Confirm
                    </Button>
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
        </TabsContent>

        {/* ── Settled: one card per settlement — what was paid and when. Settling with the
              same person again later creates a new card; earlier ones stay as they were. ── */}
        <TabsContent value="settled" className="mt-4">
          {settled.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No settled balances yet</p>
              <p className="text-sm mt-1">Once you settle up with someone, they show up here with the details</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {settled.map(e => {
                const r = e.round
                const when = new Date(r.settledAt)
                const whenValid = !isNaN(when.getTime())
                const from = new Date(r.startedAt)
                // What was outstanding when settled (exact for recorded settlements,
                // the split net for older ones). Settled ≠ paid: it was agreed closed.
                const net = r.netBefore ?? Math.round((r.theyOwed - r.youOwed) * 100) / 100
                const open = () => setDetailFor({
                  name: e.cp.name, email: e.cp.email, contactId: e.cp.id,
                  // Show only the bills & payments that belong to THIS settlement
                  round: { splitIds: r.splitIds, from: r.startedAt, to: r.settledAt },
                })
                return (
                  <div
                    key={e.key}
                    role="button"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={ev => { if (ev.key === 'Enter') open() }}
                    className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    {/* Who + when it was settled */}
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                        {e.cp.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">
                          {e.cp.name}
                          {e.of > 1 && (
                            <span className="ml-2 align-middle text-[10px] font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                              Settlement {e.no} of {e.of}
                            </span>
                          )}
                        </p>
                        {e.cp.email && <p className="text-xs text-muted-foreground truncate mt-0.5">{e.cp.email}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center justify-end gap-1 text-emerald-600 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4" />Settled
                        </div>
                        <p className="text-xs text-muted-foreground" title={whenValid ? when.toLocaleString() : undefined}>
                          {whenValid ? format(when, 'd MMM yyyy') : 'Date not recorded'}
                        </p>
                      </div>
                    </div>

                    {/* What this settlement covered (past tense of the active card's "They owe / You owe") */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {r.theyOwed      > 0 && <span>They owed (splits): <span className="font-medium text-foreground">{formatCurrency(r.theyOwed)}</span></span>}
                      {r.youOwed       > 0 && <span>You owed (splits): <span className="font-medium text-foreground">{formatCurrency(r.youOwed)}</span></span>}
                      {r.paidToThem    > 0 && <span>You paid: <span className="font-medium text-foreground">{formatCurrency(r.paidToThem)}</span></span>}
                      {r.chargedToThem > 0 && <span>They paid for you: <span className="font-medium text-foreground">{formatCurrency(r.chargedToThem)}</span></span>}
                      {r.expenses      > 0 && <span>Expenses: <span className="font-medium text-foreground">{formatCurrency(r.expenses)}</span></span>}
                      {r.received      > 0 && <span>Received: <span className="font-medium text-foreground">{formatCurrency(r.received)}</span></span>}
                    </div>

                    {/* Period covered, net outcome, how long ago */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs">
                      <span className="text-muted-foreground min-w-0">
                        {Math.abs(net) > 0.009 ? (
                          <><span className="font-semibold text-foreground">{formatCurrency(Math.abs(net))}</span> {net > 0 ? 'they owed you' : 'you owed them'} · settled</>
                        ) : r.shares > 0 || r.source === 'record' ? (
                          <>Balance was even · settled</>
                        ) : (
                          <>Settled</>
                        )}
                        {whenValid && !isNaN(from.getTime()) && format(from, 'd MMM') !== format(when, 'd MMM') && (
                          <> · {format(from, 'd MMM')} – {format(when, 'd MMM')}</>
                        )}
                        {whenValid && <> · {formatDistanceToNow(when, { addSuffix: true })}</>}
                      </span>
                      <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                        View<ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
      )}

      {/* Quick "add expense tagged to this friend" via the global popup */}
      <TransactionModal
        open={!!addExpenseFor}
        onClose={() => setAddExpenseFor(null)}
        onSaved={() => { setAddExpenseFor(null); load() }}
        defaultType="expense"
        defaultContactIds={addExpenseFor?.id ? [addExpenseFor.id] : undefined}
      />

      <BalanceDetailSheet
        open={!!detailFor}
        counterparty={detailFor}
        onClose={() => setDetailFor(null)}
        onChanged={load}
      />
    </div>
  )
}
