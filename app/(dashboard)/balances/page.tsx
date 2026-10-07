'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import { fetchProfileNames } from '@/lib/profile-names'
import { pairPaidEvents } from '@/lib/settlement-history'
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
  // ── Settlement history (shares already marked paid between the two of you) ──
  theyPaid: number       // their shares on bills you paid, now paid
  youPaid: number        // your shares on bills they paid, now paid
  paidBills: number      // how many paid shares make up the history
  lastSettledAt: string | null  // ISO time the latest share was marked paid / settlement recorded
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<FriendBalance[]>([])
  const [settled, setSettled] = useState<FriendBalance[]>([])   // people with nothing outstanding but a settled history
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

        const [friendsRes, splitsRes, payRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/splits'),
          fetch('/api/tagged-payments'),
        ])
        const friends = await friendsRes.json()
        const splits = await splitsRes.json()
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
            cp = { key, id: id ?? null, name, email: email ?? null, splitOwed: 0, splitYouOwe: 0, txnOwed: 0, txnReceived: 0, paidToThem: 0, chargedToThem: 0, net: 0, theyPaid: 0, youPaid: 0, paidBills: 0, lastSettledAt: null }
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
        for (const pay of payList) {
          const cp = ensure(pay.from_name ?? pay.from_email ?? 'Friend', pay.from_email ?? null)
          if (pay.kind === 'charge') cp.chargedToThem += pay.amount
          else cp.paidToThem += pay.amount
        }

        // Settlement history — shares between the two of you that are already paid
        // (feeds the Settled tab: what each side paid, and when).
        const later = (cp: FriendBalance, at: string | null | undefined) => {
          if (at && (!cp.lastSettledAt || at > cp.lastSettledAt)) cp.lastSettledAt = at
        }
        for (const ev of pairPaidEvents(splitList, myId, myEmail)) {
          const cp = ensure(ev.name, ev.email)
          if (ev.direction === 'they_paid') cp.theyPaid += ev.amount
          else cp.youPaid += ev.amount
          cp.paidBills += 1
          later(cp, ev.paidAt)
        }

        // Tagged (non-split) transactions only exist for saved friends (need contact_id)
        await Promise.all(
          [...map.values()].filter(cp => cp.id).map(async cp => {
            const txRes = await fetch(`/api/transactions?contact_id=${cp.id}`)
            const txns = txRes.ok ? await txRes.json() : []
            const txList = Array.isArray(txns) ? txns : txns.transactions ?? []
            cp.txnOwed = txList
              .filter((t: { type: string; split_id: string | null }) => t.type === 'expense' && !t.split_id)
              .reduce((s: number, t: { amount: number }) => s + t.amount, 0)
            cp.txnReceived = txList
              .filter((t: { type: string; split_id: string | null }) => t.type === 'income' && !t.split_id)
              .reduce((s: number, t: { amount: number }) => s + t.amount, 0)
            // A "Settled balance with …" entry (made by Close Balance) marks a settlement moment
            for (const t of txList as { description: string | null; created_at?: string; date: string }[]) {
              if (t.description?.startsWith('Settled balance')) later(cp, t.created_at ?? t.date)
            }
          })
        )

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

        // Active = something is still outstanding. Settled = nothing outstanding, but
        // there's history (shares paid / payments recorded) — newest settlement first.
        const outstanding = (b: FriendBalance) =>
          Math.abs(b.net) > 0.009 || b.splitOwed > 0.009 || b.splitYouOwe > 0.009
        const hasHistory = (b: FriendBalance) =>
          b.paidBills > 0 || b.txnOwed > 0 || b.txnReceived > 0 || b.paidToThem > 0 || b.chargedToThem > 0

        setBalances(result.filter(outstanding).sort((a, b) => b.net - a.net))
        setSettled(
          result
            .filter(b => !outstanding(b) && hasHistory(b))
            .sort((a, b) => (b.lastSettledAt ?? '').localeCompare(a.lastSettledAt ?? ''))
        )
      } finally {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Payments you already logged for this person (income tagged to them) were
  // counted against the balance. When closing, the splits they covered are marked
  // paid, so those records are un-tagged — otherwise they'd be counted twice and
  // flip the balance the other way. (The income itself stays in your transactions.)
  async function untagPayments(friend: FriendBalance) {
    interface TaggedTx {
      id: string; amount: number; type: string; category: string; description: string | null; date: string
      is_recurring: boolean; is_discrete: boolean; receipt_url: string | null; trip_id: string | null
      card_id: string | null; split_id: string | null; contact_id: string | null; contact_ids: string[] | null
    }
    const r = await fetch(`/api/transactions?contact_id=${friend.id}`)
    const body = r.ok ? await r.json() : []
    const list: TaggedTx[] = Array.isArray(body) ? body : body.transactions ?? []
    for (const t of list.filter(t => t.type === 'income' && !t.split_id)) {
      const rest = (t.contact_ids ?? []).filter(c => c !== friend.id)
      const res = await fetch(`/api/transactions?id=${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: t.amount, type: t.type, category: t.category, description: t.description, date: t.date,
          is_recurring: t.is_recurring, is_discrete: t.is_discrete, receipt_url: t.receipt_url,
          trip_id: t.trip_id, card_id: t.card_id, split_id: t.split_id,
          contact_id: t.contact_id === friend.id ? (rest[0] ?? null) : t.contact_id,
          contact_ids: rest,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to clear payment') }
    }
  }

  async function closeBalance(friend: FriendBalance) {
    setClosing(friend.key)
    setConfirmClose(null)
    const round2 = (n: number) => Math.round(n * 100) / 100
    try {
      // 1. Settle the splits between the two of you — both ways: their shares on
      //    bills you paid AND your shares on bills they paid. (Bills a third
      //    person paid are not between you two and are left alone.)
      if (friend.splitOwed > 0 || friend.splitYouOwe > 0) {
        const res = await fetch('/api/splits?type=close_balance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_email: friend.email, contact_name: friend.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      }

      // 2. Whatever is left outside the splits (tagged expenses, recorded payments,
      //    charges) is settled with one entry so the balance lands on exactly zero.
      if (friend.id) {
        let remaining = round2(friend.txnOwed - friend.txnReceived + friend.paidToThem - friend.chargedToThem)
        if (remaining < -0.009 && friend.txnReceived > 0) {
          // They'd already paid you (logged as income) — that payment has now been
          // applied to the splits above, so stop counting it a second time.
          await untagPayments(friend)
          remaining = round2(friend.txnOwed + friend.paidToThem - friend.chargedToThem)
        }
        if (Math.abs(remaining) > 0.009) {
          // remaining > 0: they owe you → they pay you (income)
          // remaining < 0: you owe them  → you pay them (expense)
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.abs(remaining),
              type: remaining > 0 ? 'income' : 'expense',
              category: 'Other',
              description: `Settled balance with ${friend.name}`,
              date: new Date().toISOString().split('T')[0],
              contact_id: friend.id,
              contact_ids: [friend.id],
            }),
          })
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to settle') }
        }
      }

      toast.success(`Settled up with ${friend.name}`)
      await load()
    } catch {
      toast.error('Failed to close balance')
    } finally {
      setClosing(null)
    }
  }

  async function remind(friend: FriendBalance) {
    if (!friend.email) { toast.error('No email for this friend'); return }
    setReminding(friend.key)
    try {
      const res = await fetch('/api/mail/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendName: friend.name, friendEmail: friend.email, amount: friend.net }),
      })
      if (!res.ok) throw new Error()
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
                onClick={() => setDetailFor({ name: b.name, email: b.email, contactId: b.id })}>
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
                    Settle your balance with <span className="font-medium text-foreground">{b.name}</span>? Marks the splits between you two as paid (both ways) and settles anything else, so the balance lands on zero.
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

        {/* ── Settled: people with nothing outstanding — what was paid and when ── */}
        <TabsContent value="settled" className="mt-4">
          {settled.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">No settled balances yet</p>
              <p className="text-sm mt-1">Once you settle up with someone, they show up here with the details</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {settled.map(b => {
                const when = b.lastSettledAt ? new Date(b.lastSettledAt) : null
                const whenValid = when && !isNaN(when.getTime())
                const net = Math.round((b.theyPaid - b.youPaid) * 100) / 100
                return (
                  <div
                    key={b.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailFor({ name: b.name, email: b.email, contactId: b.id, settledAt: b.lastSettledAt })}
                    onKeyDown={e => { if (e.key === 'Enter') setDetailFor({ name: b.name, email: b.email, contactId: b.id, settledAt: b.lastSettledAt }) }}
                    className="rounded-xl border bg-card p-4 space-y-3 cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    {/* Who + when it was settled */}
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                        {b.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{b.name}</p>
                        {b.email && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.email}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center justify-end gap-1 text-emerald-600 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4" />Settled
                        </div>
                        <p className="text-xs text-muted-foreground" title={whenValid ? when!.toLocaleString() : undefined}>
                          {whenValid ? format(when!, 'd MMM yyyy') : 'Date not recorded'}
                        </p>
                      </div>
                    </div>

                    {/* What was paid (past tense of the active card's "They owe / You owe") */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {b.theyPaid      > 0 && <span>They paid (splits): <span className="font-medium text-foreground">{formatCurrency(b.theyPaid)}</span></span>}
                      {b.youPaid       > 0 && <span>You paid (splits): <span className="font-medium text-foreground">{formatCurrency(b.youPaid)}</span></span>}
                      {b.paidToThem    > 0 && <span>You paid: <span className="font-medium text-foreground">{formatCurrency(b.paidToThem)}</span></span>}
                      {b.chargedToThem > 0 && <span>They paid for you: <span className="font-medium text-foreground">{formatCurrency(b.chargedToThem)}</span></span>}
                      {b.txnOwed       > 0 && <span>Expenses: <span className="font-medium text-foreground">{formatCurrency(b.txnOwed)}</span></span>}
                      {b.txnReceived   > 0 && <span>Received: <span className="font-medium text-foreground">{formatCurrency(b.txnReceived)}</span></span>}
                    </div>

                    {/* Net outcome + how long ago */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs">
                      <span className="text-muted-foreground min-w-0">
                        {b.paidBills > 0 && Math.abs(net) > 0.009 ? (
                          <>Net settled <span className="font-semibold text-foreground">{formatCurrency(Math.abs(net))}</span> — {net > 0 ? 'they paid you' : 'you paid them'}</>
                        ) : b.paidBills > 0 ? (
                          <>Evened out · {b.paidBills} paid share{b.paidBills !== 1 ? 's' : ''}</>
                        ) : (
                          <>Settled via recorded payments</>
                        )}
                        {whenValid && <> · {formatDistanceToNow(when!, { addSuffix: true })}</>}
                      </span>
                      <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                        View bills<ChevronRight className="w-3.5 h-3.5" />
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
