'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import { fetchProfileNames } from '@/lib/profile-names'
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, Loader2, Send, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
}

interface SplitRow {
  created_by: string
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
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<FriendBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)  // contact id pending confirmation
  const [closing, setClosing] = useState<string | null>(null)
  const [addExpenseFor, setAddExpenseFor] = useState<FriendBalance | null>(null)
  const [detailFor, setDetailFor] = useState<BalanceCounterparty | null>(null)  // open balance detail
  const [payments, setPayments] = useState<TaggedPayment[]>([])   // pending "you paid X" notifications
  const [addPayment, setAddPayment] = useState<TaggedPayment | null>(null)  // one being added to my expenses
  const [actingPayment, setActingPayment] = useState<string | null>(null)

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
            cp = { key, id: id ?? null, name, email: email ?? null, splitOwed: 0, splitYouOwe: 0, txnOwed: 0, txnReceived: 0, paidToThem: 0, chargedToThem: 0, net: 0 }
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
          const iAmCreator = !!myId && sp.created_by === myId
          if (iAmCreator) {
            // Everyone else's unpaid share is owed TO me
            for (const p of sp.split_participants ?? []) {
              if (p.is_paid || isSelf(p)) continue
              ensure(p.participant_name, p.participant_email).splitOwed += p.amount_owed
            }
          } else {
            // I only participate → my unpaid share is what I owe the creator
            const myRow = (sp.split_participants ?? []).find(isSelf)
            if (myRow && !myRow.is_paid) {
              const creator = (sp.split_participants ?? []).find(p => p.participant_user_id === sp.created_by)
              ensure(creator?.participant_name ?? 'Split creator', creator?.participant_email ?? null)
                .splitYouOwe += myRow.amount_owed
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
        setPayments(payList.filter(p => p.status === 'pending'))

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

        setBalances(
          result
            .filter(b => Math.abs(b.net) > 0.001 || b.splitOwed > 0 || b.splitYouOwe > 0 || b.txnOwed > 0 || b.txnReceived > 0 || b.paidToThem > 0 || b.chargedToThem > 0)
            .sort((a, b) => b.net - a.net)
        )
      } finally {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function dismissPayment(p: TaggedPayment) {
    setActingPayment(p.id)
    try {
      await fetch(`/api/tagged-payments?id=${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }),
      })
      setPayments(prev => prev.filter(x => x.id !== p.id))
    } catch {
      toast.error('Failed to dismiss')
    } finally {
      setActingPayment(null)
    }
  }

  async function closeBalance(friend: FriendBalance) {
    setClosing(friend.key)
    setConfirmClose(null)
    try {
      // 1. Mark this person's outstanding split shares as paid (if any)
      if (friend.splitOwed > 0) {
        const res = await fetch('/api/splits?type=close_balance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_email: friend.email, contact_name: friend.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
      }

      // 2. Settle the remaining (non-split) amount they owe — e.g. tagged expenses —
      //    by recording a settlement income tagged to them.
      const remaining = Math.round((friend.net - friend.splitOwed) * 100) / 100
      if (remaining > 0.009 && friend.id) {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: remaining,
            type: 'income',
            category: 'Other',
            description: `Settled balance with ${friend.name}`,
            date: new Date().toISOString().split('T')[0],
            contact_id: friend.id,
            contact_ids: [friend.id],
          }),
        })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to settle') }
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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Balances</h1>
        <p className="text-sm text-muted-foreground">Net amounts across splits and tagged transactions</p>
      </div>

      {/* Payments a friend recorded that YOU made to them */}
      {payments.length > 0 && (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex flex-col gap-2">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{p.from_name ?? p.from_email}</span>{' '}
                  {p.kind === 'charge' ? 'recorded that you owe them' : 'recorded that you paid them'}{' '}
                  <span className="font-semibold whitespace-nowrap">{formatCurrency(p.amount)}</span>
                  {p.kind === 'charge' && <span className="text-muted-foreground"> (they paid for you)</span>}
                </p>
                {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">Already counted in your balance below.</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" disabled={actingPayment === p.id} onClick={() => dismissPayment(p)}>
                  {actingPayment === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Dismiss'}
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={actingPayment === p.id} onClick={() => setAddPayment(p)}>
                  Add to my expenses
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary strip */}
      {!loading && balances.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
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
      ) : balances.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="font-medium">All settled up</p>
          <p className="text-sm mt-1">No outstanding balances with any friends</p>
        </div>
      ) : (
        <div className="space-y-2">
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
                    Settle your balance with <span className="font-medium text-foreground">{b.name}</span>? Marks their splits paid and records the rest as settled.
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

      {/* Quick "add expense tagged to this friend" via the global popup */}
      <TransactionModal
        open={!!addExpenseFor}
        onClose={() => setAddExpenseFor(null)}
        onSaved={() => { setAddExpenseFor(null); load() }}
        defaultType="expense"
        defaultContactIds={addExpenseFor?.id ? [addExpenseFor.id] : undefined}
      />

      {/* Add a "you paid them" record into my own expense ledger (untagged, so it
          doesn't double-count the balance which is already driven by the record) */}
      <TransactionModal
        open={!!addPayment}
        onClose={() => setAddPayment(null)}
        onSaved={async () => {
          if (addPayment) {
            try {
              await fetch(`/api/tagged-payments?id=${addPayment.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'added' }),
              })
            } catch { /* ignore */ }
          }
          setAddPayment(null)
          load()
        }}
        defaultType="expense"
        defaultAmount={addPayment?.amount}
        defaultDescription={addPayment ? `Paid ${addPayment.from_name ?? addPayment.from_email ?? ''}`.trim() : undefined}
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
