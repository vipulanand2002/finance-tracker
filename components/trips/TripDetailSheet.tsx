'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { format, differenceInDays, parseISO, isValid } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Calendar, MapPin, Receipt, Wallet, TrendingDown, Plus,
  Users, Link2, CheckSquare, Square, ArrowDownCircle, ChevronDown,
  LockKeyhole, LockKeyholeOpen, Loader2, MessageSquare, User, Eye, EyeOff, BarChart2, BellRing, Pencil, Paperclip,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { CATEGORY_COLORS } from '@/lib/constants'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TripChat from './TripChat'
import { formatCurrency } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Trip, Transaction } from '@/types'
import TransactionModal from '@/components/transactions/TransactionModal'
import SplitModal, { type EditingSplit } from '@/components/splits/SplitModal'

interface Props {
  trip: Trip | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
  inline?: boolean
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

interface PersonalBudget {
  id: string
  user_id: string
  user_email: string
  amount: number
  is_private: boolean
}

interface TripSplitParticipant {
  id: string
  participant_name: string
  participant_email: string | null
  participant_user_id: string | null
  amount_owed: number
  is_paid: boolean
}

interface TripSplit {
  id: string
  created_by: string
  title: string
  total_amount: number
  category: string
  description: string | null
  date: string
  is_settled: boolean
  receipt_url?: string | null
  receipt_url_2?: string | null
  reminder_count?: number | null
  last_reminder_sent_at?: string | null
  split_participants: TripSplitParticipant[]
}

export default function TripDetailSheet({ trip, open, onClose, onUpdated, inline = false }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [linkCandidates, setLinkCandidates] = useState<Transaction[]>([])
  const [selectedLink, setSelectedLink] = useState<Set<string>>(new Set())
  const [linking, setLinking] = useState(false)
  const [togglingClose, setTogglingClose] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [personalBudgets, setPersonalBudgets] = useState<PersonalBudget[]>([])
  const [myBudgetInput, setMyBudgetInput] = useState('')
  const [isPrivateBudget, setIsPrivateBudget] = useState(false)
  const [savingBudget, setSavingBudget] = useState(false)
  const myBudgetRef = useRef<HTMLInputElement>(null)
  const [tripSplits, setTripSplits] = useState<TripSplit[]>([])
  const [editingTripSplit, setEditingTripSplit] = useState<EditingSplit | null>(null)
  const [sendingSplitReminder, setSendingSplitReminder] = useState<string | null>(null)
  const [txExpanded, setTxExpanded] = useState(true)
  const [txViewMode, setTxViewMode] = useState<'all' | 'category' | 'member'>('all')
  const [sendingReminders, setSendingReminders] = useState(false)

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
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        setCurrentUserEmail((user.email ?? '').toLowerCase())
        setCurrentUserName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          ''
        )
      }
    })
  }, [])

  const fetchPersonalBudgets = useCallback(async () => {
    if (!trip) return
    try {
      const res = await fetch(`/api/trip-personal-budget?trip_id=${trip.id}`)
      const data: PersonalBudget[] = await res.json()
      setPersonalBudgets(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }, [trip])

  const fetchTripSplits = useCallback(async () => {
    if (!trip) return
    try {
      const res = await fetch(`/api/splits?trip_id=${trip.id}`)
      const data: TripSplit[] = await res.json()
      setTripSplits(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }, [trip])

  useEffect(() => {
    if (open && trip) {
      fetchTransactions()
      fetchPersonalBudgets()
      fetchTripSplits()
      setLinkMode(false)
      setSelectedLink(new Set())
    }
  }, [open, trip, fetchTransactions, fetchPersonalBudgets, fetchTripSplits])

  // Sync myBudgetInput + privacy when personalBudgets load
  useEffect(() => {
    if (!currentUserId) return
    const mine = personalBudgets.find(b => b.user_id === currentUserId)
    setMyBudgetInput(mine ? String(mine.amount) : '')
    setIsPrivateBudget(mine?.is_private ?? false)
  }, [personalBudgets, currentUserId])

  async function openLinkMode() {
    if (!trip) return
    // Fetch transactions in trip date range that don't have a trip_id
    const params = new URLSearchParams()
    if (trip.start_date) params.set('from', trip.start_date)
    if (trip.end_date) params.set('to', trip.end_date)
    const res = await fetch(`/api/transactions?${params}`)
    const data: Transaction[] = await res.json()
    setLinkCandidates(data.filter(t => !t.trip_id && t.type === 'expense'))
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

  // Personal spending = own direct transactions (NOT from splits) + share as participant in trip splits
  function computePersonalSpending(userId: string, userEmail: string): number {
    const email = userEmail.toLowerCase()
    const directTx = transactions
      .filter(t => t.user_id === userId && !t.split_id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
    const splitShare = tripSplits
      .flatMap(s => s.split_participants)
      .filter(p =>
        p.participant_user_id === userId ||
        (p.participant_email?.toLowerCase() === email)
      )
      .reduce((sum, p) => sum + p.amount_owed, 0)
    return directTx + splitShare
  }

  async function saveMyBudget(privateOverride?: boolean) {
    if (!trip) return
    const amount = parseFloat(myBudgetInput)
    const privacy = privateOverride !== undefined ? privateOverride : isPrivateBudget
    setSavingBudget(true)
    try {
      if (myBudgetInput.trim() === '' || isNaN(amount) || amount <= 0) {
        await fetch(`/api/trip-personal-budget?trip_id=${trip.id}`, { method: 'DELETE' })
        setPersonalBudgets(prev => prev.filter(b => b.user_id !== currentUserId))
      } else {
        const res = await fetch('/api/trip-personal-budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_id: trip.id, amount, is_private: privacy }),
        })
        const saved: PersonalBudget = await res.json()
        setPersonalBudgets(prev => {
          const without = prev.filter(b => b.user_id !== currentUserId)
          return [...without, saved]
        })
      }
    } catch {
      toast.error('Failed to save budget')
    } finally {
      setSavingBudget(false)
    }
  }

  async function sendSplitReminder(splitId: string, count: number) {
    setSendingSplitReminder(splitId)
    try {
      const res = await fetch('/api/mail/split-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split_id: splitId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      const n = data.sent ?? count
      toast.success(`Reminder sent to ${n} participant${n !== 1 ? 's' : ''}!`)
      fetchTripSplits()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminder')
    } finally {
      setSendingSplitReminder(null)
    }
  }

  async function sendTripReminders() {
    if (!trip) return
    const hasEmailParticipants = tripSplits.some(s =>
      s.split_participants.some(p => !p.is_paid && p.participant_email)
    )
    if (!hasEmailParticipants) {
      toast.warning('No unpaid participants with email addresses found in this trip\'s splits.')
      return
    }
    setSendingReminders(true)
    try {
      const res = await fetch('/api/mail/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'trip', trip_id: trip.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'no_pending_splits') {
          toast.info('No pending splits with email addresses for this trip.')
        } else {
          toast.error(data.error ?? 'Failed to send reminders')
        }
        return
      }
      toast.success(`Reminders sent! (${data.sent} email${data.sent !== 1 ? 's' : ''})`)
      fetchTripSplits()
    } catch {
      toast.error('Failed to send reminders')
    } finally {
      setSendingReminders(false)
    }
  }

  if (!trip) return null

  // Trips only track expenses — income is irrelevant in trip context
  const expenses = transactions.filter(t => t.type === 'expense')
  // Discrete expenses are private — excluded from trip totals and category breakdown
  const publicExpenses = expenses.filter(t => !t.is_discrete)
  const totalSpent = publicExpenses.reduce((s, t) => s + t.amount, 0)

  const startDate = safeDate(trip.start_date)
  const endDate = safeDate(trip.end_date)
  const days = startDate && endDate ? differenceInDays(endDate, startDate) + 1 : null

  // Category breakdown uses only public (non-discrete) expenses
  const catMap = new Map<string, number>()
  for (const t of publicExpenses) {
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount)
  }
  const catBreakdown = [...catMap.entries()].sort((a, b) => b[1] - a[1])

  const budgetPct = trip.budget_total && trip.budget_total > 0
    ? Math.min((totalSpent / trip.budget_total) * 100, 100)
    : null

  const splitDefaultTitle = trip.name + (trip.destination ? ` – ${trip.destination}` : '')

  const _sheetInner = (
    <>
          {/* Cover image / gradient header */}
          <div className={`relative w-full shrink-0 ${inline ? 'h-48 sm:h-56 rounded-2xl overflow-hidden mb-1' : 'h-40 sm:h-44'}`}>
            {trip.image_url ? (
              <img src={trip.image_url} alt={trip.name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${tripGradient(trip.name)}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h2 className="text-white text-lg sm:text-xl font-bold leading-tight truncate">{trip.name}</h2>
                  {trip.is_closed && (
                    <Badge className="bg-white/20 text-white border-white/30 text-xs shrink-0">Closed</Badge>
                  )}
                </div>
                {trip.destination && (
                  <div className="flex items-center gap-1 text-white/80 text-sm">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{trip.destination}</span>
                  </div>
                )}
              </div>
              {trip.is_owner !== false && (
                <button
                  onClick={toggleClosed}
                  disabled={togglingClose}
                  title={trip.is_closed ? 'Reopen trip' : 'Close trip'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-white/15 hover:bg-white/30 active:bg-white/30 text-white border border-white/30 transition-colors disabled:opacity-50 shrink-0"
                >
                  {togglingClose
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : trip.is_closed
                      ? <LockKeyholeOpen className="w-3.5 h-3.5" />
                      : <LockKeyhole className="w-3.5 h-3.5" />}
                  {trip.is_closed ? 'Reopen' : 'Close'}
                </button>
              )}
            </div>
          </div>

          {!inline && (
            <SheetHeader className="sr-only">
              <SheetTitle>{trip.name}</SheetTitle>
            </SheetHeader>
          )}

          <Tabs defaultValue="overview">
            {(() => {
              const tabCls = trip.is_closed ? 'text-[10px] sm:text-xs' : 'text-xs sm:text-sm'
              return (
                <TabsList className={`grid mx-4 mt-4 w-[calc(100%-2rem)] ${trip.is_closed ? 'grid-cols-5' : 'grid-cols-4'}`}>
                  <TabsTrigger value="overview" className={tabCls}>Overview</TabsTrigger>
                  <TabsTrigger value="splits" className={tabCls}>
                    <Receipt className="w-3 h-3 mr-0.5 sm:mr-1" />
                    Splits
                    {tripSplits.length > 0 && (
                      <span className="ml-1 text-[10px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-medium hidden sm:inline">
                        {tripSplits.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="members" className={tabCls}>
                    <Users className="w-3 h-3 mr-0.5 sm:mr-1" />
                    Members
                  </TabsTrigger>
                  <TabsTrigger value="chat" className={tabCls}>
                    <MessageSquare className="w-3 h-3 mr-0.5 sm:mr-1" />
                    Chat
                  </TabsTrigger>
                  {trip.is_closed && (
                    <TabsTrigger value="stats" className={tabCls}>
                      <BarChart2 className="w-3 h-3 mr-0.5 sm:mr-1" />
                      Stats
                    </TabsTrigger>
                  )}
                </TabsList>
              )
            })()}

            <TabsContent value="chat" className="mt-0 focus-visible:outline-none">
              <TripChat tripId={trip.id} />
            </TabsContent>

            <TabsContent value="members" className="p-4 space-y-3 mt-0 focus-visible:outline-none">
              {(() => {
                // Build full member list: current user + invitations + legacy members
                const memberList: { name: string; email: string; userId?: string | null }[] = []
                if (currentUserEmail) {
                  memberList.push({ name: currentUserName || currentUserEmail.split('@')[0], email: currentUserEmail, userId: currentUserId })
                }
                const seenEmails = new Set(currentUserEmail ? [currentUserEmail.toLowerCase()] : [])
                for (const inv of (trip.trip_invitations ?? [])) {
                  if (inv.status === 'declined') continue
                  const isPlaceholder = inv.invitee_email.startsWith('_nomail_')
                  const e = isPlaceholder ? '' : inv.invitee_email
                  if (e && seenEmails.has(e.toLowerCase())) continue
                  const name = inv.invitee_name || (e ? e.split('@')[0] : '')
                  if (!name) continue
                  memberList.push({ name, email: e })
                  if (e) seenEmails.add(e.toLowerCase())
                }
                for (const m of (trip.trip_members ?? [])) {
                  const email = m.email ?? ''
                  if (!email || seenEmails.has(email.toLowerCase())) continue
                  memberList.push({ name: m.name || email.split('@')[0], email })
                  seenEmails.add(email.toLowerCase())
                }

                if (memberList.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                      <Users className="w-8 h-8 opacity-20" />
                      <p className="text-sm">No members added to this trip yet</p>
                    </div>
                  )
                }

                const totalTrip = memberList.reduce((sum, m) => {
                  const emailLower = m.email.toLowerCase()
                  const splitShare = tripSplits
                    .flatMap(s => s.split_participants)
                    .filter(p =>
                      (m.userId && p.participant_user_id === m.userId) ||
                      (m.email && p.participant_email?.toLowerCase() === emailLower)
                    )
                    .reduce((s, p) => s + p.amount_owed, 0)
                  const directSpent = m.userId
                    ? transactions.filter(t => t.user_id === m.userId && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                    : 0
                  return sum + splitShare + directSpent
                }, 0)

                return (
                  <div className="space-y-2">
                    {memberList.map(m => {
                      const emailLower = m.email.toLowerCase()
                      const splitShare = tripSplits
                        .flatMap(s => s.split_participants)
                        .filter(p =>
                          (m.userId && p.participant_user_id === m.userId) ||
                          (m.email && p.participant_email?.toLowerCase() === emailLower)
                        )
                        .reduce((sum, p) => sum + p.amount_owed, 0)
                      const directSpent = m.userId
                        ? transactions.filter(t => t.user_id === m.userId && t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
                        : 0
                      const total = splitShare + directSpent
                      const pct = totalTrip > 0 ? (total / totalTrip) * 100 : 0
                      const isMe = m.userId === currentUserId

                      return (
                        <div key={m.email || m.name} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                                {(m.name || m.email).charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {m.name}{isMe && <span className="text-muted-foreground font-normal ml-1 text-xs">(you)</span>}
                                </p>
                                {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold ${total > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {total > 0 ? formatCurrency(total) : '—'}
                              </p>
                              {totalTrip > 0 && total > 0 && (
                                <p className="text-[10px] text-muted-foreground">{Math.round(pct)}% of trip</p>
                              )}
                            </div>
                          </div>
                          {(splitShare > 0 || directSpent > 0) && (
                            <>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                {splitShare > 0 && <span>Splits: <span className="font-medium text-foreground">{formatCurrency(splitShare)}</span></span>}
                                {directSpent > 0 && <span>Direct: <span className="font-medium text-foreground">{formatCurrency(directSpent)}</span></span>}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </TabsContent>

            {/* Stats tab — only rendered when trip is closed */}
            {trip.is_closed && (
              <TabsContent value="stats" className="p-4 space-y-6 mt-0 focus-visible:outline-none">
                {(() => {
                  if (publicExpenses.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                        <BarChart2 className="w-8 h-8 opacity-20" />
                        <p className="text-sm">No expense data to analyse</p>
                      </div>
                    )
                  }

                  /* ── Build derived data ── */

                  // Daily spending — sorted chronologically
                  const dailyData = [...publicExpenses.reduce((m, t) => {
                    m.set(t.date, (m.get(t.date) ?? 0) + t.amount)
                    return m
                  }, new Map<string, number>())]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, amount]) => ({ date: format(parseISO(date), 'd MMM'), amount }))

                  // Peak day
                  const peakDay = dailyData.reduce((best, d) => d.amount > best.amount ? d : best, dailyData[0])

                  // Category data for pie
                  const pieData = catBreakdown.map(([cat, amount]) => ({ name: cat, value: amount }))

                  // Member breakdown — reuse the same email resolution logic
                  const userEmailMap = new Map<string, string>()
                  if (currentUserId && currentUserEmail) userEmailMap.set(currentUserId, currentUserEmail)
                  for (const b of personalBudgets) userEmailMap.set(b.user_id, b.user_email)
                  for (const s of tripSplits) {
                    for (const p of s.split_participants) {
                      if (p.participant_user_id && p.participant_email) {
                        userEmailMap.set(p.participant_user_id, p.participant_email)
                      }
                    }
                  }
                  const memberBreakdown = [...publicExpenses.reduce((m, t) => {
                    m.set(t.user_id, (m.get(t.user_id) ?? 0) + t.amount)
                    return m
                  }, new Map<string, number>())]
                    .sort(([, a], [, b]) => b - a)
                    .map(([userId, amount]) => ({
                      label: userId === currentUserId
                        ? 'Me'
                        : (userEmailMap.get(userId)?.split('@')[0] ?? 'Member'),
                      amount,
                      pct: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
                    }))

                  return (
                    <>
                      {/* ── Summary chips ── */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Total Spent</p>
                          <p className="text-lg font-bold text-red-600 mt-0.5 truncate">{formatCurrency(totalSpent)}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Transactions</p>
                          <p className="text-lg font-bold mt-0.5">{publicExpenses.length}</p>
                        </div>
                        {days && (
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="text-lg font-bold mt-0.5">{days} day{days !== 1 ? 's' : ''}</p>
                          </div>
                        )}
                        {days && (
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Avg / Day</p>
                            <p className="text-lg font-bold mt-0.5 truncate">{formatCurrency(Math.round(totalSpent / days))}</p>
                          </div>
                        )}
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Top Category</p>
                          <p className="text-sm font-bold mt-0.5 truncate">{catBreakdown[0]?.[0] ?? '—'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">Peak Day</p>
                          <p className="text-sm font-bold mt-0.5 truncate">{peakDay?.date ?? '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{peakDay ? formatCurrency(peakDay.amount) : ''}</p>
                        </div>
                      </div>

                      {/* ── Daily spending bar chart ── */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spending by Day</p>
                        <div className="rounded-lg border p-3">
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10 }}
                                interval={dailyData.length > 10 ? Math.ceil(dailyData.length / 8) - 1 : 0}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                                tick={{ fontSize: 10 }}
                                width={38}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip
                                formatter={(v) => [formatCurrency(Number(v) || 0), 'Spent']}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                cursor={{ fill: 'hsl(var(--muted))' }}
                              />
                              <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                                {dailyData.map((entry, i) => (
                                  <Cell
                                    key={i}
                                    fill={entry.amount === peakDay?.amount ? '#ef4444' : 'hsl(var(--primary))'}
                                    fillOpacity={entry.amount === peakDay?.amount ? 1 : 0.7}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <p className="text-[10px] text-muted-foreground text-center mt-1">Peak day highlighted in red</p>
                        </div>
                      </div>

                      {/* ── Category donut ── */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Category</p>
                        <div className="rounded-lg border p-3">
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={pieData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={52}
                                outerRadius={80}
                                paddingAngle={2}
                              >
                                {pieData.map((entry, i) => (
                                  <Cell
                                    key={i}
                                    fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(v) => [formatCurrency(Number(v) || 0), 'Spent']}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          {/* Legend */}
                          <div className="space-y-1.5 mt-1">
                            {catBreakdown.map(([cat, amt]) => (
                              <div key={cat} className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ background: CATEGORY_COLORS[cat] ?? '#94a3b8' }}
                                />
                                <span className="text-xs flex-1 truncate text-muted-foreground">{cat}</span>
                                <span className="text-xs font-medium shrink-0">{formatCurrency(amt)}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0 w-8 text-right">
                                  {totalSpent > 0 ? `${Math.round((amt / totalSpent) * 100)}%` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* ── Member breakdown ── */}
                      {memberBreakdown.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Member</p>
                          <div className="rounded-lg border divide-y">
                            {memberBreakdown.map(({ label, amount, pct }) => (
                              <div key={label} className="px-3 py-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                      {label.charAt(0).toUpperCase()}
                                    </span>
                                    <span className="text-sm font-medium truncate">{label}</span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-sm font-semibold text-red-600">{formatCurrency(amount)}</span>
                                    <span className="text-xs text-muted-foreground ml-1.5">{Math.round(pct)}%</span>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary/70 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </TabsContent>
            )}

            <TabsContent value="splits" className="p-4 space-y-4 mt-0 focus-visible:outline-none">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">Trip Splits</p>
                <div className="flex items-center gap-2">
                  {tripSplits.length > 0 && trip.is_owner !== false && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={sendTripReminders}
                      disabled={sendingReminders}
                    >
                      {sendingReminders
                        ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        : <BellRing className="w-3.5 h-3.5 mr-1" />}
                      Remind All
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setSplitOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> New Split
                  </Button>
                </div>
              </div>

              {tripSplits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Receipt className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No splits yet for this trip</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tripSplits.map(s => {
                    const paidCount = s.split_participants.filter(p => p.is_paid).length
                    const pendingAmount = s.split_participants
                      .filter(p => !p.is_paid)
                      .reduce((sum, p) => sum + p.amount_owed, 0)
                    return (
                      <div key={s.id} className="rounded-lg border p-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{s.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {s.category} · {format(parseISO(s.date), 'd MMM yyyy')}
                            </p>
                            {s.last_reminder_sent_at && (() => {
                              const diff = Math.floor((Date.now() - new Date(s.last_reminder_sent_at).getTime()) / 86_400_000)
                              const label = diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff}d ago`
                              return (
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                  Reminded {label}{(s.reminder_count ?? 0) > 1 ? ` · ×${s.reminder_count}` : ''}
                                </p>
                              )
                            })()}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                              {s.receipt_url && (
                                <a href={s.receipt_url} target="_blank" rel="noopener noreferrer" title="View attachment 1" className="text-muted-foreground hover:text-primary">
                                  <Paperclip className="w-3 h-3" />
                                </a>
                              )}
                              {s.receipt_url_2 && (
                                <a href={s.receipt_url_2} target="_blank" rel="noopener noreferrer" title="View attachment 2" className="text-muted-foreground hover:text-primary">
                                  <Paperclip className="w-3 h-3" />
                                </a>
                              )}
                              <p className="text-sm font-bold">{formatCurrency(s.total_amount)}</p>
                              {!s.is_settled && s.created_by === currentUserId && (
                                <button
                                  onClick={() => setEditingTripSplit({
                                    id: s.id,
                                    title: s.title,
                                    total_amount: s.total_amount,
                                    category: s.category,
                                    description: s.description,
                                    date: s.date,
                                    trip_id: trip.id,
                                    contact_id: null,
                                    split_participants: s.split_participants,
                                  })}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {s.is_settled ? (
                              <span className="text-[11px] text-emerald-600 font-medium">Settled</span>
                            ) : pendingAmount > 0 ? (
                              <span className="text-[11px] text-amber-600 font-medium">
                                {formatCurrency(pendingAmount)} due
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-medium">
                                {paidCount}/{s.split_participants.length} paid
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5 border-t pt-2">
                          {s.split_participants.map(p => (
                            <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                  p.is_paid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
                                }`}>
                                  {p.participant_name.charAt(0).toUpperCase()}
                                </span>
                                <span className={`truncate ${p.is_paid ? 'text-muted-foreground line-through' : ''}`}>
                                  {p.participant_name}
                                </span>
                                {p.is_paid && (
                                  <span className="shrink-0 text-emerald-600 bg-emerald-50 dark:bg-emerald-950 rounded px-1 py-0.5 text-[10px] font-medium">
                                    Paid
                                  </span>
                                )}
                              </div>
                              <span className={`shrink-0 font-semibold ${p.is_paid ? 'text-emerald-600' : ''}`}>
                                {formatCurrency(p.amount_owed)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {s.created_by === currentUserId && !s.is_settled && s.split_participants.some(p => !p.is_paid && p.participant_email) && (
                          <div className="border-t pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs w-full"
                              disabled={sendingSplitReminder === s.id}
                              onClick={() => sendSplitReminder(
                                s.id,
                                s.split_participants.filter(p => !p.is_paid && p.participant_email).length
                              )}
                            >
                              {sendingSplitReminder === s.id
                                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending…</>
                                : <><BellRing className="w-3 h-3 mr-1" />Send Reminder</>}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="overview" className="p-4 space-y-5 mt-0 focus-visible:outline-none">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="font-bold text-sm text-red-600 mt-0.5">{formatCurrency(totalSpent)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{expenses.length} transactions</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Spent by Me</p>
                <p className="font-bold text-sm text-red-600 mt-0.5">
                  {currentUserId
                    ? formatCurrency(computePersonalSpending(currentUserId, currentUserEmail))
                    : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">incl. splits &amp; contacts</p>
              </div>
            </div>

            {/* Total budget progress — owner always sees it; members only see it when visible */}
            {trip.budget_total && trip.budget_total > 0 && (
              trip.is_owner !== false || trip.budget_visible_to_members !== false
            ) && (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                    Budget
                    {trip.is_owner !== false && trip.budget_visible_to_members === false && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded px-1 py-0.5">
                        <EyeOff className="w-2.5 h-2.5" /> Hidden
                      </span>
                    )}
                  </span>
                  <span className={`text-right ${totalSpent > trip.budget_total ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
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
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <span className="truncate">{b.category}</span>
                        <span className={`shrink-0 ${spent > b.amount ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {formatCurrency(spent)} / {formatCurrency(b.amount)}
                        </span>
                      </div>
                      <Progress value={pct} className={`h-1.5 ${spent > b.amount ? '[&>div]:bg-red-500' : ''}`} />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Personal budgets */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personal Budgets</p>

              {/* Current user's editable budget */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <User className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium">My Budget</span>
                  {currentUserId && (() => {
                    const mySpent = computePersonalSpending(currentUserId, currentUserEmail)
                    const myBudget = personalBudgets.find(b => b.user_id === currentUserId)
                    if (mySpent === 0) return null
                    return (
                      <span className="text-xs text-muted-foreground">
                        Spent: <span className="font-medium text-foreground">{formatCurrency(mySpent)}</span>
                        {myBudget ? ` / ${formatCurrency(myBudget.amount)}` : ''}
                      </span>
                    )
                  })()}
                  {/* Privacy toggle — pushed to end of row */}
                  <button
                    type="button"
                    title={isPrivateBudget ? 'Budget hidden from members — click to make visible' : 'Budget visible to members — click to hide'}
                    onClick={async () => {
                      const next = !isPrivateBudget
                      setIsPrivateBudget(next)
                      await saveMyBudget(next)
                    }}
                    className={`ml-auto flex items-center gap-1 text-[10px] rounded-full px-2 py-1 border transition-colors shrink-0 ${
                      isPrivateBudget
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'border-muted text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {isPrivateBudget ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {isPrivateBudget ? 'Private' : 'Visible'}
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    ref={myBudgetRef}
                    type="number"
                    min="0"
                    placeholder="Set your personal budget…"
                    className="h-8 text-sm flex-1"
                    value={myBudgetInput}
                    onChange={e => setMyBudgetInput(e.target.value)}
                    onBlur={() => saveMyBudget()}
                    onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                    disabled={savingBudget}
                  />
                  {savingBudget && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                </div>
                {(() => {
                  const myBudget = personalBudgets.find(b => b.user_id === currentUserId)
                  if (!myBudget || !currentUserId) return null
                  const mySpent = computePersonalSpending(currentUserId, currentUserEmail)
                  const pct = Math.min((mySpent / myBudget.amount) * 100, 100)
                  const over = mySpent > myBudget.amount
                  return (
                    <div className="space-y-1">
                      <Progress value={pct} className={`h-1.5 ${over ? '[&>div]:bg-red-500' : ''}`} />
                      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                        <span>{over ? <span className="text-red-600">Over budget</span> : 'Budget progress'}</span>
                        <span className="shrink-0">{formatCurrency(mySpent)} / {formatCurrency(myBudget.amount)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Other members' budgets with their spending */}
              {personalBudgets.filter(b => b.user_id !== currentUserId).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Team Members</p>
                  {personalBudgets
                    .filter(b => b.user_id !== currentUserId)
                    .map(b => {
                      const spent = computePersonalSpending(b.user_id, b.user_email)
                      const pct = Math.min((spent / b.amount) * 100, 100)
                      const over = spent > b.amount
                      return (
                        <div key={b.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                                {b.user_email.charAt(0).toUpperCase()}
                              </span>
                              <span className="truncate">{b.user_email.split('@')[0]}</span>
                            </div>
                            <span className={`shrink-0 ${over ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {formatCurrency(spent)} / {formatCurrency(b.amount)}
                            </span>
                          </div>
                          <Progress value={pct} className={`h-1 ${over ? '[&>div]:bg-red-500' : ''}`} />
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Category breakdown */}
            {catBreakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spending by Category</p>
                {catBreakdown.map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate min-w-0">{cat}</span>
                    <span className="font-medium shrink-0">{formatCurrency(amt)}</span>
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
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    Link transactions from {trip.start_date ? format(parseISO(trip.start_date), 'dd MMM') : 'any date'}
                    {trip.end_date ? ` – ${format(parseISO(trip.end_date), 'dd MMM')}` : ''}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setLinkMode(false)} className="shrink-0">Cancel</Button>
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
                          <span className="text-xs font-medium shrink-0 text-red-600">
                            -{formatCurrency(t.amount)}
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

            {/* Transactions — collapsible with category / member grouping */}
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setTxExpanded(v => !v)}
                  className="flex items-center gap-1.5 group"
                >
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${txExpanded ? '' : '-rotate-90'}`} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                    Expenses ({expenses.length})
                  </span>
                </button>

                {txExpanded && expenses.length > 0 && (
                  <div className="flex items-center bg-muted rounded-full p-0.5">
                    {(['all', 'category', 'member'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setTxViewMode(m)}
                        className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                          txViewMode === m
                            ? 'bg-background text-foreground shadow-sm font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'all' ? 'All' : m === 'category' ? 'Category' : 'Member'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {txExpanded && (loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No expenses yet. Add one or link existing.</p>
              ) : txViewMode === 'all' ? (
                /* ── All: flat list ── */
                <div className="divide-y border rounded-lg overflow-hidden">
                  {expenses.map(t => (
                    <div key={t.id} className={`flex items-center gap-2 py-2.5 px-3 group ${t.is_discrete ? 'opacity-75' : ''}`}>
                      <span className="text-xs text-muted-foreground w-14 shrink-0">{format(parseISO(t.date), 'd MMM')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm truncate">{t.description ?? t.category}</p>
                          {t.is_discrete && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded px-1 py-0.5 shrink-0">
                              <EyeOff className="w-2.5 h-2.5" /> Private
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t.category}</p>
                      </div>
                      <span className="text-sm font-semibold shrink-0 text-red-600">-{formatCurrency(t.amount)}</span>
                      {!trip.is_closed && (
                        <button onClick={() => unlinkTransaction(t.id)} title="Unlink from trip"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : txViewMode === 'category' ? (
                /* ── Category view: grouped by category ── */
                <div className="space-y-2">
                  {(() => {
                    const groups = new Map<string, Transaction[]>()
                    for (const t of expenses) {
                      const list = groups.get(t.category) ?? []
                      list.push(t)
                      groups.set(t.category, list)
                    }
                    return [...groups.entries()]
                      .sort(([, a], [, b]) =>
                        b.reduce((s, t) => s + t.amount, 0) - a.reduce((s, t) => s + t.amount, 0)
                      )
                      .map(([cat, txs]) => {
                        const catTotal = txs.reduce((s, t) => s + t.amount, 0)
                        return (
                          <div key={cat} className="rounded-lg border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <span className="text-sm font-medium">{cat}</span>
                              <span className="text-sm font-semibold text-red-600">-{formatCurrency(catTotal)}</span>
                            </div>
                            <div className="divide-y">
                              {txs.map(t => (
                                <div key={t.id} className={`flex items-center gap-2 py-2 px-3 group ${t.is_discrete ? 'opacity-75' : ''}`}>
                                  <span className="text-xs text-muted-foreground w-12 shrink-0">{format(parseISO(t.date), 'd MMM')}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm truncate">{t.description ?? t.category}</p>
                                      {t.is_discrete && (
                                        <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded px-1 py-0.5 shrink-0">
                                          <EyeOff className="w-2.5 h-2.5" /> Private
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-sm font-semibold shrink-0 text-red-600">-{formatCurrency(t.amount)}</span>
                                  {!trip.is_closed && (
                                    <button onClick={() => unlinkTransaction(t.id)} title="Unlink from trip"
                                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                                      <Link2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })
                  })()}
                </div>
              ) : (
                /* ── Member view: grouped by who spent ── */
                <div className="space-y-2">
                  {(() => {
                    // Build a best-effort user_id → email map from all available sources
                    const userEmailMap = new Map<string, string>()
                    if (currentUserId && currentUserEmail) userEmailMap.set(currentUserId, currentUserEmail)
                    for (const b of personalBudgets) userEmailMap.set(b.user_id, b.user_email)
                    for (const s of tripSplits) {
                      for (const p of s.split_participants) {
                        if (p.participant_user_id && p.participant_email) {
                          userEmailMap.set(p.participant_user_id, p.participant_email)
                        }
                      }
                    }

                    const groups = new Map<string, Transaction[]>()
                    for (const t of expenses) {
                      const list = groups.get(t.user_id) ?? []
                      list.push(t)
                      groups.set(t.user_id, list)
                    }
                    return [...groups.entries()]
                      .sort(([, a], [, b]) =>
                        b.reduce((s, t) => s + t.amount, 0) - a.reduce((s, t) => s + t.amount, 0)
                      )
                      .map(([userId, txs]) => {
                        const memberTotal = txs.reduce((s, t) => s + t.amount, 0)
                        const isMe = userId === currentUserId
                        const email = userEmailMap.get(userId)
                        const label = isMe ? 'Me' : (email?.split('@')[0] ?? 'Member')
                        return (
                          <div key={userId} className="rounded-lg border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {label.charAt(0).toUpperCase()}
                                </span>
                                <span className="text-sm font-medium">{label}</span>
                              </div>
                              <span className="text-sm font-semibold text-red-600">-{formatCurrency(memberTotal)}</span>
                            </div>
                            <div className="divide-y">
                              {txs.map(t => (
                                <div key={t.id} className={`flex items-center gap-2 py-2 px-3 group ${t.is_discrete ? 'opacity-75' : ''}`}>
                                  <span className="text-xs text-muted-foreground w-12 shrink-0">{format(parseISO(t.date), 'd MMM')}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm truncate">{t.description ?? t.category}</p>
                                      {t.is_discrete && (
                                        <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded px-1 py-0.5 shrink-0">
                                          <EyeOff className="w-2.5 h-2.5" /> Private
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{t.category}</p>
                                  </div>
                                  <span className="text-sm font-semibold shrink-0 text-red-600">-{formatCurrency(t.amount)}</span>
                                  {!trip.is_closed && (
                                    <button onClick={() => unlinkTransaction(t.id)} title="Unlink from trip"
                                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                                      <Link2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })
                  })()}
                </div>
              ))}
            </div>
            </TabsContent>
          </Tabs>
    </>
  )

  const _modals = (
    <>
      <TransactionModal
        open={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onSaved={() => { fetchTransactions(); onUpdated() }}
        defaultTripId={trip.id}
      />

      <SplitModal
        open={splitOpen || !!editingTripSplit}
        editingSplit={editingTripSplit}
        onClose={() => { setSplitOpen(false); setEditingTripSplit(null) }}
        onSaved={() => { fetchTripSplits(); fetchTransactions(); onUpdated() }}
        defaultTitle={splitDefaultTitle}
        defaultAmount={totalSpent}
        tripId={trip.id}
        defaultParticipants={[
          // Current user first (owner or member — they paid the bill)
          ...(currentUserEmail ? [{ name: currentUserName || currentUserEmail.split('@')[0], email: currentUserEmail }] : []),
          // Other trip members (skip current user if they're also in trip_members)
          ...(trip.trip_members ?? [])
            .filter(m => !m.email || m.email.toLowerCase() !== currentUserEmail)
            .map(m => ({ name: m.name || (m.email ? m.email.split('@')[0] : ''), email: m.email ?? '' })),
        ]}
      />
    </>
  )

  if (inline) {
    return <>{_sheetInner}{_modals}</>
  }

  return (
    <>
      <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0" side="right">
          {_sheetInner}
        </SheetContent>
      </Sheet>
      {_modals}
    </>
  )
}
