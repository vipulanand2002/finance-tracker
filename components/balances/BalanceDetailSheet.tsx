'use client'

import { useEffect, useState, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pencil, Eye, SplitSquareVertical, Receipt, ArrowUpRight, ArrowDownLeft, CheckCircle2, Paperclip } from 'lucide-react'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import SplitModal, { type EditingSplit } from '@/components/splits/SplitModal'
import TransactionModal from '@/components/transactions/TransactionModal'
import type { Transaction } from '@/types'

export interface BalanceCounterparty {
  name: string
  email: string | null
  contactId: string | null
}

interface Participant {
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  amount_owed: number
  is_paid: boolean
}
interface SplitRow {
  id: string
  title: string
  total_amount: number
  category: string
  description: string | null
  date: string
  is_settled: boolean
  created_by: string
  trip_id?: string | null
  contact_id?: string | null
  receipt_url?: string | null
  receipt_url_2?: string | null
  card_id?: string | null
  split_participants: Participant[]
}
interface TaggedPayment {
  id: string; from_email: string | null; from_name: string | null; amount: number; kind?: string; status: string; date: string; description: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  counterparty: BalanceCounterparty | null
  onChanged?: () => void
}

export default function BalanceDetailSheet({ open, onClose, counterparty, onChanged }: Props) {
  const [loading, setLoading] = useState(false)
  const [myId, setMyId] = useState('')
  const [myEmail, setMyEmail] = useState('')
  const [splits, setSplits] = useState<SplitRow[]>([])
  const [txns, setTxns] = useState<Transaction[]>([])
  const [payments, setPayments] = useState<TaggedPayment[]>([])
  const [editingSplit, setEditingSplit] = useState<EditingSplit | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [viewSplit, setViewSplit] = useState<SplitRow | null>(null)
  const [viewTx, setViewTx] = useState<Transaction | null>(null)

  const emailLower = counterparty?.email?.toLowerCase() ?? ''
  const nameLower = counterparty?.name?.toLowerCase() ?? ''

  const matchesCp = useCallback((p: Participant) => {
    if (emailLower && p.participant_email?.toLowerCase() === emailLower) return true
    if (!p.participant_email && nameLower && p.participant_name.toLowerCase() === nameLower) return true
    return false
  }, [emailLower, nameLower])

  const isSelf = useCallback((p: Participant) =>
    (!!p.participant_user_id && p.participant_user_id === myId) ||
    (!!myEmail && p.participant_email?.toLowerCase() === myEmail), [myId, myEmail])

  const load = useCallback(async () => {
    if (!counterparty) return
    setLoading(true)
    try {
      const { data: { user } } = await createClient().auth.getUser()
      const uid = user?.id ?? ''
      const uemail = (user?.email ?? '').toLowerCase()
      setMyId(uid); setMyEmail(uemail)

      const [splitsRes, txnRes, payRes] = await Promise.all([
        fetch('/api/splits').then(r => r.json()).catch(() => []),
        counterparty.contactId
          ? fetch(`/api/transactions?contact_id=${counterparty.contactId}`).then(r => r.json()).catch(() => [])
          : Promise.resolve([]),
        fetch('/api/tagged-payments').then(r => r.json()).catch(() => []),
      ])

      const allSplits: SplitRow[] = Array.isArray(splitsRes) ? splitsRes : []
      setSplits(allSplits.filter(s => (s.split_participants ?? []).some(matchesCp)))

      const txList: Transaction[] = Array.isArray(txnRes) ? txnRes : (txnRes.transactions ?? [])
      setTxns(txList.filter(t => !t.split_id))

      const payList: TaggedPayment[] = Array.isArray(payRes) ? payRes : []
      setPayments(emailLower ? payList.filter(p => p.from_email?.toLowerCase() === emailLower) : [])
    } finally {
      setLoading(false)
    }
  }, [counterparty, matchesCp, emailLower])

  useEffect(() => { if (open) load() }, [open, load])

  // Net (positive = they owe you)
  let splitTheyOwe = 0, splitYouOwe = 0
  for (const s of splits) {
    if (s.is_settled) continue
    if (s.created_by === myId) {
      for (const p of s.split_participants) if (!p.is_paid && matchesCp(p)) splitTheyOwe += p.amount_owed
    } else {
      const mine = s.split_participants.find(p =>
        (p.participant_user_id && p.participant_user_id === myId) || (myEmail && p.participant_email?.toLowerCase() === myEmail))
      if (mine && !mine.is_paid) splitYouOwe += mine.amount_owed
    }
  }
  const txnOwed = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const txnReceived = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const paidToThem = payments.filter(p => p.kind !== 'charge').reduce((s, p) => s + p.amount, 0)
  const chargedToThem = payments.filter(p => p.kind === 'charge').reduce((s, p) => s + p.amount, 0)
  const net = splitTheyOwe + txnOwed + paidToThem - splitYouOwe - txnReceived - chargedToThem

  function editSplit(s: SplitRow) {
    if (s.created_by !== myId) return // only the creator can edit
    setEditingSplit(s as unknown as EditingSplit)
  }

  const afterChange = () => { load(); onChanged?.() }

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{counterparty?.name ?? 'Balance'}</SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-5 px-4 pb-8 pt-1">
              {/* Net summary */}
              <div className={`rounded-xl p-4 border ${net > 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : net < 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' : 'bg-muted'}`}>
                <p className="text-xs text-muted-foreground">
                  {net > 0 ? `${counterparty?.name} owes you` : net < 0 ? `You owe ${counterparty?.name}` : 'All settled up'}
                </p>
                {net !== 0 ? (
                  <p className={`text-2xl font-bold mt-0.5 flex items-center gap-1 ${net > 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                    {net > 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    {formatCurrency(Math.abs(net))}
                  </p>
                ) : (
                  <p className="text-emerald-600 flex items-center gap-1 mt-0.5"><CheckCircle2 className="w-5 h-5" /> Settled</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {splitTheyOwe   > 0 && <span>They owe (splits): <span className="text-foreground font-medium">{formatCurrency(splitTheyOwe)}</span></span>}
                  {splitYouOwe    > 0 && <span>You owe (splits): <span className="text-foreground font-medium">{formatCurrency(splitYouOwe)}</span></span>}
                  {paidToThem     > 0 && <span>You paid: <span className="text-foreground font-medium">{formatCurrency(paidToThem)}</span></span>}
                  {chargedToThem  > 0 && <span>They paid for you: <span className="text-foreground font-medium">{formatCurrency(chargedToThem)}</span></span>}
                  {txnOwed        > 0 && <span>Expenses: <span className="text-foreground font-medium">{formatCurrency(txnOwed)}</span></span>}
                  {txnReceived    > 0 && <span>Received: <span className="text-foreground font-medium">{formatCurrency(txnReceived)}</span></span>}
                </div>
              </div>

              {/* Splits */}
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><SplitSquareVertical className="w-4 h-4 text-muted-foreground" /> Splits</p>
                {splits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No splits with {counterparty?.name}.</p>
                ) : splits.map(s => {
                  const iCreated = s.created_by === myId
                  // Show the amount that flows between the two of you for this split:
                  //  - I created it → what the other person still owes me
                  //  - they created it → what I (the viewer) still owe them (my contribution)
                  let amt = 0
                  if (iCreated) {
                    amt = s.split_participants.filter(matchesCp).reduce((a, p) => a + (p.is_paid ? 0 : p.amount_owed), 0)
                  } else {
                    const mine = s.split_participants.find(isSelf)
                    amt = mine && !mine.is_paid ? mine.amount_owed : 0
                  }
                  const label = iCreated ? 'they owe' : 'your share'
                  return (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(s.date + 'T00:00:00'), 'dd MMM yyyy')} · {s.category} · Total {formatCurrency(s.total_amount)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-right">
                            <span className={`text-sm font-semibold ${s.is_settled || amt === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {s.is_settled ? 'Settled' : formatCurrency(amt)}
                            </span>
                            {!s.is_settled && amt > 0 && <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>}
                          </div>
                          <button onClick={() => setViewSplit(s)} title="View" className="text-muted-foreground hover:text-foreground"><Eye className="w-3.5 h-3.5" /></button>
                          {iCreated && !s.is_settled && (
                            <button onClick={() => editSplit(s)} title="Edit" className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Tagged transactions */}
              {txns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1.5"><Receipt className="w-4 h-4 text-muted-foreground" /> Tagged transactions</p>
                  {txns.map(t => (
                    <div key={t.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.description ?? t.category}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy')} · {t.category}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {t.type === 'income' ? '+' : ''}{formatCurrency(t.amount)}
                          </span>
                          <button onClick={() => setViewTx(t)} title="View" className="text-muted-foreground hover:text-foreground"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingTx(t)} title="Edit" className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cross-user payment records */}
              {payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Recorded by {counterparty?.name}</p>
                  {payments.map(p => (
                    <div key={p.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{p.kind === 'charge' ? 'They paid for you' : 'You paid them'}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.date + 'T00:00:00'), 'dd MMM yyyy')}{p.description ? ` · ${p.description}` : ''}</p>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <SplitModal
        open={!!editingSplit}
        editingSplit={editingSplit}
        onClose={() => setEditingSplit(null)}
        onSaved={() => { setEditingSplit(null); afterChange() }}
      />

      <TransactionModal
        open={!!editingTx}
        transaction={editingTx ?? undefined}
        onClose={() => setEditingTx(null)}
        onSaved={() => { setEditingTx(null); afterChange() }}
      />

      {/* Read-only split card */}
      <Dialog open={!!viewSplit} onOpenChange={v => { if (!v) setViewSplit(null) }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewSplit?.title}</DialogTitle></DialogHeader>
          {viewSplit && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {format(new Date(viewSplit.date + 'T00:00:00'), 'dd MMM yyyy')} · {viewSplit.category}
                {viewSplit.is_settled && <span className="ml-1 text-emerald-600 font-medium">· Settled</span>}
              </p>
              {viewSplit.description && <p className="text-sm">{viewSplit.description}</p>}
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                <span className="text-muted-foreground text-xs">Total</span>
                <span className="font-semibold">{formatCurrency(viewSplit.total_amount)}</span>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Participants</p>
                {viewSplit.split_participants.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.participant_name}{p.participant_email ? '' : ''}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-medium tabular-nums">{formatCurrency(p.amount_owed)}</span>
                      <Badge variant={p.is_paid ? 'secondary' : 'outline'} className="text-[10px]">{p.is_paid ? 'Paid' : 'Pending'}</Badge>
                    </span>
                  </div>
                ))}
              </div>
              {(viewSplit.receipt_url || viewSplit.receipt_url_2) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {viewSplit.receipt_url && (
                    <a href={viewSplit.receipt_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="w-3.5 h-3.5" />Attachment 1</a>
                  )}
                  {viewSplit.receipt_url_2 && (
                    <a href={viewSplit.receipt_url_2} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="w-3.5 h-3.5" />Attachment 2</a>
                  )}
                </div>
              )}
              {viewSplit.created_by === myId && !viewSplit.is_settled && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => { const s = viewSplit; setViewSplit(null); editSplit(s) }}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit split
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Read-only transaction card */}
      <Dialog open={!!viewTx} onOpenChange={v => { if (!v) setViewTx(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{viewTx?.description ?? viewTx?.category}</DialogTitle></DialogHeader>
          {viewTx && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className={`text-2xl font-bold ${viewTx.type === 'income' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {viewTx.type === 'income' ? '+' : ''}{formatCurrency(viewTx.amount)}
                </span>
                <Badge variant="secondary" className="text-xs capitalize">{viewTx.type}</Badge>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Category: <span className="text-foreground">{viewTx.category}</span></p>
                <p>Date: <span className="text-foreground">{format(new Date(viewTx.date + 'T00:00:00'), 'dd MMM yyyy')}</span></p>
              </div>
              {viewTx.receipt_url && (
                <a href={viewTx.receipt_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="w-3.5 h-3.5" />Receipt</a>
              )}
              <Button size="sm" variant="outline" className="w-full" onClick={() => { const t = viewTx; setViewTx(null); setEditingTx(t) }}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit transaction
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
