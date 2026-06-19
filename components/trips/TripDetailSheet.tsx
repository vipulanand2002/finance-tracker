'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format, differenceInDays, parseISO, isValid } from 'date-fns'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Calendar, MapPin, Receipt, Wallet, TrendingDown, Plus,
  Users, Link2, CheckSquare, Square, ArrowUpCircle, ArrowDownCircle,
  LockKeyhole, LockKeyholeOpen, Loader2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Trip, Transaction } from '@/types'
import TransactionModal from '@/components/transactions/TransactionModal'
import SplitModal from '@/components/splits/SplitModal'

interface Props {
  trip: Trip | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

function safeDate(s: string | null | undefined) {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

const TRIP_COLORS = [
  'from-violet-500 to-purple-700',
  'from-rose-400 to-pink-700',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-700',
  'from-sky-400 to-blue-700',
  'from-fuchsia-400 to-violet-700',
]

function tripGradient(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % TRIP_COLORS.length
  return TRIP_COLORS[h]
}

export default function TripDetailSheet({ trip, open, onClose, onUpdated }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [linkCandidates, setLinkCandidates] = useState<Transaction[]>([])
  const [selectedLink, setSelectedLink] = useState<Set<string>>(new Set())
  const [linking, setLinking] = useState(false)
  const [togglingClose, setTogglingClose] = useState(false)

  const fetchTransactions = useCallback(async () => {
    if (!trip) return
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions?trip_id=${trip.id}`)
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [trip])

  useEffect(() => {
    if (open && trip) {
      fetchTransactions()
      setLinkMode(false)
      setSelectedLink(new Set())
    }
  }, [open, trip, fetchTransactions])

  async function openLinkMode() {
    if (!trip) return
    // Fetch transactions in trip date range that don't have a trip_id
    const params = new URLSearchParams()
    if (trip.start_date) params.set('from', trip.start_date)
    if (trip.end_date) params.set('to', trip.end_date)
    const res = await fetch(`/api/transactions?${params}`)
    const data: Transaction[] = await res.json()
    setLinkCandidates(data.filter(t => !t.trip_id))
    setLinkMode(true)
    setSelectedLink(new Set())
  }

  async function confirmLink() {
    if (!trip || selectedLink.size === 0) return
    setLinking(true)
    try {
      await Promise.all(
        [...selectedLink].map(id =>
          fetch(`/api/transactions?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_id: trip.id }),
          })
        )
      )
      toast.success(`Linked ${selectedLink.size} transaction${selectedLink.size !== 1 ? 's' : ''} to trip`)
      setLinkMode(false)
      fetchTransactions()
      onUpdated()
    } catch {
      toast.error('Failed to link transactions')
    } finally {
      setLinking(false)
    }
  }

  async function unlinkTransaction(id: string) {
    try {
      await fetch(`/api/transactions?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: null }),
      })
      setTransactions(prev => prev.filter(t => t.id !== id))
      onUpdated()
    } catch {
      toast.error('Failed to unlink')
    }
  }

  async function toggleClosed() {
    if (!trip) return
    setTogglingClose(true)
    try {
      const res = await fetch(`/api/trips?id=${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_closed: !trip.is_closed }),
      })
      if (!res.ok) throw new Error()
      toast.success(trip.is_closed ? 'Trip reopened' : 'Trip closed')
      onUpdated()
    } catch {
      toast.error('Failed to update trip')
    } finally {
      setTogglingClose(false)
    }
  }

  if (!trip) return null

  const expenses = transactions.filter(t => t.type === 'expense')
  const income = transactions.filter(t => t.type === 'income')
  const totalSpent = expenses.reduce((s, t) => s + t.amount, 0)
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)

  const startDate = safeDate(trip.start_date)
  const endDate = safeDate(trip.end_date)
  const days = startDate && endDate ? differenceInDays(endDate, startDate) + 1 : null

  // Category breakdown
  const catMap = new Map<string, number>()
  for (const t of expenses) {
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount)
  }
  const catBreakdown = [...catMap.entries()].sort((a, b) => b[1] - a[1])

  const budgetPct = trip.budget_total && trip.budget_total > 0
    ? Math.min((totalSpent / trip.budget_total) * 100, 100)
    : null

  const splitDefaultTitle = trip.name + (trip.destination ? ` – ${trip.destination}` : '')

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0" side="right">
          {/* Cover image / gradient header */}
          <div className="relative h-44 w-full shrink-0">
            {trip.image_url ? (
              <img src={trip.image_url} alt={trip.name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${tripGradient(trip.name)}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-white text-xl font-bold leading-tight">{trip.name}</h2>
                  {trip.is_closed && (
                    <Badge className="bg-white/20 text-white border-white/30 text-xs">Closed</Badge>
                  )}
                </div>
                {trip.destination && (
                  <div className="flex items-center gap-1 text-white/80 text-sm">
                    <MapPin className="w-3.5 h-3.5" /> {trip.destination}
                  </div>
                )}
              </div>
              <button
                onClick={toggleClosed}
                disabled={togglingClose}
                title={trip.is_closed ? 'Reopen trip' : 'Close trip'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/15 hover:bg-white/30 text-white border border-white/30 transition-colors disabled:opacity-50 shrink-0"
              >
                {togglingClose
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : trip.is_closed
                    ? <LockKeyholeOpen className="w-3.5 h-3.5" />
                    : <LockKeyhole className="w-3.5 h-3.5" />}
                {trip.is_closed ? 'Reopen' : 'Close'}
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">{trip.name}</SheetTitle>
            </SheetHeader>

            {/* Meta row */}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(startDate, 'dd MMM yyyy')}
                  {endDate && <> — {format(endDate, 'dd MMM yyyy')}</>}
                </span>
              )}
              {days && <Badge variant="secondary">{days} day{days !== 1 ? 's' : ''}</Badge>}
              {trip.description && <span className="text-muted-foreground">{trip.description}</span>}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="font-bold text-sm text-red-600 mt-0.5">{formatCurrency(totalSpent)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="font-bold text-sm text-emerald-600 mt-0.5">{formatCurrency(totalIncome)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="font-bold text-sm mt-0.5">{transactions.length}</p>
              </div>
            </div>

            {/* Total budget progress */}
            {trip.budget_total && trip.budget_total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Budget</span>
                  <span className={totalSpent > trip.budget_total ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                    {formatCurrency(totalSpent)} / {formatCurrency(trip.budget_total)}
                  </span>
                </div>
                <Progress
                  value={budgetPct ?? 0}
                  className={`h-2 ${totalSpent > trip.budget_total ? '[&>div]:bg-red-500' : ''}`}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {totalSpent > trip.budget_total
                    ? `${formatCurrency(totalSpent - trip.budget_total)} over budget`
                    : `${formatCurrency(trip.budget_total - totalSpent)} remaining`}
                </p>
              </div>
            )}

            {/* Category budgets progress */}
            {(trip.trip_budgets?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category Budgets</p>
                {trip.trip_budgets!.map(b => {
                  const spent = catMap.get(b.category) ?? 0
                  const pct = Math.min((spent / b.amount) * 100, 100)
                  return (
                    <div key={b.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{b.category}</span>
                        <span className={spent > b.amount ? 'text-red-600' : 'text-muted-foreground'}>
                          {formatCurrency(spent)} / {formatCurrency(b.amount)}
                        </span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${spent > b.amount ? '[&>div]:bg-red-500' : ''}`} />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Category breakdown */}
            {catBreakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spending by Category</p>
                {catBreakdown.map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{cat}</span>
                    <span className="font-medium">{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Action buttons */}
            {trip.is_closed ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                <LockKeyhole className="w-4 h-4 shrink-0" />
                This trip is closed. Reopen it to add or link transactions.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAddExpenseOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Expense
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSplitOpen(true)}>
                  <Users className="w-3.5 h-3.5 mr-1" /> Split
                </Button>
                {!linkMode && (
                  <Button size="sm" variant="outline" onClick={openLinkMode}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Link Existing
                  </Button>
                )}
              </div>
            )}

            {/* Link existing transactions panel */}
            {linkMode && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Link transactions from {trip.start_date ? format(parseISO(trip.start_date), 'dd MMM') : 'any date'}
                    {trip.end_date ? ` – ${format(parseISO(trip.end_date), 'dd MMM')}` : ''}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setLinkMode(false)}>Cancel</Button>
                </div>
                {linkCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unlinked transactions in this date range.</p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto divide-y text-sm">
                      {linkCandidates.map(t => (
                        <div key={t.id} className="flex items-center gap-2 py-2">
                          <button onClick={() => setSelectedLink(s => {
                            const next = new Set(s)
                            next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                            return next
                          })}>
                            {selectedLink.has(t.id)
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground" />}
                          </button>
                          <span className="text-xs text-muted-foreground w-16 shrink-0">
                            {format(parseISO(t.date), 'd MMM')}
                          </span>
                          <span className="flex-1 truncate">{t.description ?? t.category}</span>
                          <span className={`text-xs font-medium shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={confirmLink}
                      disabled={selectedLink.size === 0 || linking}
                    >
                      {linking ? 'Linking…' : `Link ${selectedLink.size} selected`}
                    </Button>
                  </>
                )}
              </div>
            )}

            <Separator />

            {/* Transactions list */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transactions</p>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No transactions yet. Add an expense or link existing ones.</p>
              ) : (
                <div className="divide-y">
                  {transactions.map(t => (
                    <div key={t.id} className="flex items-center gap-2 py-2.5 group">
                      {t.type === 'income'
                        ? <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <ArrowDownCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <span className="text-xs text-muted-foreground w-14 shrink-0">
                        {format(parseISO(t.date), 'd MMM')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.description ?? t.category}</p>
                        <p className="text-xs text-muted-foreground">{t.category}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                      {!trip.is_closed && (
                        <button
                          onClick={() => unlinkTransaction(t.id)}
                          title="Unlink from trip"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <TransactionModal
        open={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onSaved={() => { fetchTransactions(); onUpdated() }}
        defaultTripId={trip.id}
      />

      <SplitModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        onSaved={() => toast.success('Split created!')}
        defaultTitle={splitDefaultTitle}
        defaultAmount={totalSpent}
        tripId={trip.id}
        defaultParticipants={(trip.trip_members ?? []).map(m => ({ name: m.name ?? '', email: m.email }))}
      />
    </>
  )
}
