'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface FriendBalance {
  id: string
  name: string
  email: string | null
  splitOwed: number      // they owe you from splits
  txnOwed: number        // expense tagged to them
  txnReceived: number    // income tagged from them
  net: number            // positive = they owe you, negative = you owe them
}

export default function BalancesPage() {
  const [balances, setBalances] = useState<FriendBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)  // contact id pending confirmation
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [friendsRes, splitsRes] = await Promise.all([
          fetch('/api/friends'),
          fetch('/api/splits'),
        ])
        const friends = await friendsRes.json()
        const splits = await splitsRes.json()

        if (!Array.isArray(friends)) return

        const result: FriendBalance[] = await Promise.all(
          friends.map(async (f: { id: string; name: string; email: string | null }) => {
            // Fetch tagged transactions for this friend
            const txRes = await fetch(`/api/transactions?contact_id=${f.id}`)
            const txns = txRes.ok ? await txRes.json() : []
            const txList = Array.isArray(txns) ? txns : txns.transactions ?? []

            const txnOwed = txList
              .filter((t: { type: string; split_id: string | null }) => t.type === 'expense' && !t.split_id)
              .reduce((s: number, t: { amount: number }) => s + t.amount, 0)
            const txnReceived = txList
              .filter((t: { type: string; split_id: string | null }) => t.type === 'income' && !t.split_id)
              .reduce((s: number, t: { amount: number }) => s + t.amount, 0)

            // Splits owed by this friend
            const splitOwed = Array.isArray(splits)
              ? splits
                  .filter((sp: { is_settled: boolean }) => !sp.is_settled)
                  .flatMap((sp: { split_participants: { participant_email: string | null; participant_name: string; amount_owed: number; is_paid: boolean }[] }) =>
                    sp.split_participants ?? []
                  )
                  .filter((p: { participant_email: string | null; participant_name: string; is_paid: boolean }) => {
                    if (p.is_paid) return false
                    if (f.email && p.participant_email?.toLowerCase() === f.email.toLowerCase()) return true
                    if (!p.participant_email && p.participant_name.toLowerCase() === f.name.toLowerCase()) return true
                    return false
                  })
                  .reduce((s: number, p: { amount_owed: number }) => s + p.amount_owed, 0)
              : 0

            const net = splitOwed + txnOwed - txnReceived
            return { id: f.id, name: f.name, email: f.email, splitOwed, txnOwed, txnReceived, net }
          })
        )

        // Only show friends with any interaction
        setBalances(result.filter(b => b.net !== 0 || b.txnOwed > 0 || b.txnReceived > 0 || b.splitOwed > 0)
          .sort((a, b) => b.net - a.net))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function closeBalance(friend: FriendBalance) {
    setClosing(friend.id)
    setConfirmClose(null)
    try {
      const res = await fetch('/api/splits?type=close_balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_email: friend.email, contact_name: friend.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(
        data.markedPaid > 0
          ? `Settled ${data.markedPaid} split share${data.markedPaid !== 1 ? 's' : ''} with ${friend.name}`
          : `No open splits found for ${friend.name}`
      )
      // Refresh balances
      setBalances(prev => prev.filter(b => {
        if (b.id !== friend.id) return true
        // Keep if they still have txn-only balance
        return b.txnOwed > 0 || b.txnReceived > 0
      }).map(b => b.id === friend.id ? { ...b, splitOwed: 0, net: b.txnOwed - b.txnReceived } : b))
    } catch {
      toast.error('Failed to close balance')
    } finally {
      setClosing(null)
    }
  }

  async function remind(friend: FriendBalance) {
    if (!friend.email) { toast.error('No email for this friend'); return }
    setReminding(friend.id)
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
            <div key={b.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                    {b.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{b.name}</p>
                    {b.email && <p className="text-xs text-muted-foreground truncate">{b.email}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {b.net > 0 ? (
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-emerald-600 font-semibold text-sm">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        {formatCurrency(b.net)}
                      </div>
                      <p className="text-xs text-muted-foreground">owes you</p>
                    </div>
                  ) : b.net < 0 ? (
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-blue-600 font-semibold text-sm">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        {formatCurrency(Math.abs(b.net))}
                      </div>
                      <p className="text-xs text-muted-foreground">you owe</p>
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-muted-foreground text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Settled
                      </div>
                    </div>
                  )}

                  {b.net > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      disabled={reminding === b.id || !b.email}
                      onClick={() => remind(b)}
                    >
                      {reminding === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Remind
                    </Button>
                  )}

                  {/* Close Balance button — only when splits are owed */}
                  {b.splitOwed > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      disabled={closing === b.id}
                      onClick={() => setConfirmClose(b.id)}
                    >
                      {closing === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Settle
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline confirm for closing balance */}
              {confirmClose === b.id && (
                <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    Mark all splits with <span className="font-medium text-foreground">{b.name}</span> as paid?
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmClose(null)}>
                      <X className="w-3 h-3 mr-1" />Cancel
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => closeBalance(b)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />Confirm
                    </Button>
                  </div>
                </div>
              )}

              {/* Breakdown */}
              {confirmClose !== b.id && (b.splitOwed > 0 || b.txnOwed > 0 || b.txnReceived > 0) && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {b.splitOwed > 0 && <span>Splits: <span className="font-medium text-foreground">{formatCurrency(b.splitOwed)}</span></span>}
                  {b.txnOwed > 0 && <span>Expenses: <span className="font-medium text-foreground">{formatCurrency(b.txnOwed)}</span></span>}
                  {b.txnReceived > 0 && <span>Received: <span className="font-medium text-foreground">{formatCurrency(b.txnReceived)}</span></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
