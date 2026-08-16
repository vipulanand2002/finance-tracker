'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { format, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreditCard } from 'lucide-react'
import StatsCards from '@/components/dashboard/StatsCards'
import SpendingChart from '@/components/dashboard/SpendingChart'
import RecentTransactions from '@/components/dashboard/RecentTransactions'
import BudgetProgress from '@/components/dashboard/BudgetProgress'
import { useCardToggle } from '@/lib/useCardToggle'
import type { Transaction, Budget, BudgetWithSpent, CategoryTotal, MonthlyData } from '@/types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function DashboardPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [includeCards, setIncludeCards] = useCardToggle()

  const [allTx, setAllTx] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [netAccountBalance, setNetAccountBalance] = useState<number | null>(null)
  // Active expense category names — deleted categories map to "Unknown" in charts
  const [activeExpenseCats, setActiveExpenseCats] = useState<Set<string>>(new Set())

  // Fetch all-time balance + active categories once on mount
  useEffect(() => {
    fetch('/api/transactions/totals')
      .then(r => r.json())
      .then(d => { if (typeof d.net_balance === 'number') setNetAccountBalance(d.net_balance) })
      .catch(() => {})

    fetch('/api/categories')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setActiveExpenseCats(new Set(
            d.filter((c: { list_type: string }) => c.list_type === 'expense').map((c: { name: string }) => c.name)
          ))
        }
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (isNaN(year) || year < 2000 || year > 2099) return
    setLoading(true)
    try {
      const selectedDate = new Date(year, month - 1)
      const to = format(endOfMonth(selectedDate), 'yyyy-MM-dd')
      // Fetch 6 months of data (covers both monthly trend and weekly breakdowns)
      const from = format(subMonths(startOfMonth(selectedDate), 5), 'yyyy-MM-dd')

      const [txRes, budgetRes] = await Promise.all([
        fetch(`/api/transactions?from=${from}&to=${to}`),
        fetch(`/api/budgets?month=${month}&year=${year}`),
      ])
      const [txData, budgetData] = await Promise.all([txRes.json(), budgetRes.json()])
      setAllTx(Array.isArray(txData) ? txData : [])
      setBudgets(Array.isArray(budgetData) ? budgetData : [])
    } catch {
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  // Cards ON: include everything — card expenses count as expenses, Card Payment counts as income
  // Cards OFF: exclude card imports and Card Payment entries entirely
  const isCountable = useCallback(
    (t: Transaction) => includeCards ? true : (!t.card_id && t.category !== 'Card Payment'),
    [includeCards],
  )

  const isExpense = useCallback(
    (t: Transaction) => t.type === 'expense',
    [],
  )

  const isIncome = useCallback(
    (t: Transaction) => includeCards
      ? t.type === 'income'
      : t.type === 'income' && t.category !== 'Card Payment',
    [includeCards],
  )

  const countableTx = useMemo(() => allTx.filter(isCountable), [allTx, isCountable])

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const monthTx = useMemo(
    () => countableTx.filter(t => t.date.startsWith(monthPrefix)),
    [countableTx, monthPrefix],
  )

  // Monthly stats
  const totalIncome = useMemo(() => monthTx.filter(isIncome).reduce((s, t) => s + t.amount, 0), [monthTx, isIncome])
  const totalExpenses = useMemo(() => monthTx.filter(isExpense).reduce((s, t) => s + t.amount, 0), [monthTx, isExpense])
  const netBalance = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0

  // Category breakdown for selected month — deleted categories show as "Unknown"
  const categoryData = useMemo((): CategoryTotal[] => {
    const catMap: Record<string, number> = {}
    monthTx.filter(isExpense).forEach(t => {
      // Map to "Unknown" if the category was deleted (not in active set)
      const cat = activeExpenseCats.size > 0 && !activeExpenseCats.has(t.category)
        ? 'Unknown'
        : t.category
      catMap[cat] = (catMap[cat] ?? 0) + t.amount
    })
    return Object.entries(catMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [monthTx, totalExpenses, isExpense, activeExpenseCats])

  // Monthly trend (6 months ending at selected month)
  const monthlyData = useMemo((): MonthlyData[] => {
    const base = new Date(year, month - 1)
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(base, 5 - i)
      const prefix = format(d, 'yyyy-MM')
      const txs = countableTx.filter(t => t.date.startsWith(prefix))
      return {
        month: format(d, 'MMM'),
        income: txs.filter(isIncome).reduce((s, t) => s + t.amount, 0),
        expenses: txs.filter(isExpense).reduce((s, t) => s + t.amount, 0),
      }
    })
  }, [countableTx, month, year, isIncome, isExpense])

  // Weekly trend (last 8 weeks ending at end of selected month)
  const weeklyData = useMemo((): MonthlyData[] => {
    const base = endOfMonth(new Date(year, month - 1))
    return Array.from({ length: 8 }, (_, i) => {
      const wEnd = endOfWeek(subWeeks(base, 7 - i), { weekStartsOn: 1 })
      const wStart = startOfWeek(wEnd, { weekStartsOn: 1 })
      const startStr = format(wStart, 'yyyy-MM-dd')
      const endStr = format(wEnd, 'yyyy-MM-dd')
      const txs = countableTx.filter(t => t.date >= startStr && t.date <= endStr)
      return {
        month: format(wStart, 'MMM d'),
        income: txs.filter(isIncome).reduce((s, t) => s + t.amount, 0),
        expenses: txs.filter(isExpense).reduce((s, t) => s + t.amount, 0),
      }
    })
  }, [countableTx, month, year, isIncome, isExpense])

  // Daily trend (all days in selected month)
  const dailyData = useMemo((): MonthlyData[] => {
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      const dateStr = `${monthPrefix}-${day}`
      const txs = countableTx.filter(t => t.date === dateStr)
      return {
        month: String(i + 1),
        income: txs.filter(isIncome).reduce((s, t) => s + t.amount, 0),
        expenses: txs.filter(isExpense).reduce((s, t) => s + t.amount, 0),
      }
    })
  }, [countableTx, monthPrefix, month, year, isIncome, isExpense])

  // Budget progress
  const budgetProgress = useMemo((): BudgetWithSpent[] =>
    budgets.map(b => ({
      ...b,
      spent: monthTx
        .filter(t => isExpense(t) && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0),
    })),
  [budgets, monthTx, isExpense])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {MONTH_NAMES[month - 1]} {year} overview
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={v => v && setMonth(parseInt(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            value={year}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setYear(v) }}
            className="w-24"
            min={2000}
            max={2099}
          />

          <Button
            variant={includeCards ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIncludeCards(!includeCards)}
            className="gap-1.5 shrink-0"
            title={includeCards ? 'Showing card category spending' : 'Card categories hidden'}
          >
            <CreditCard className="w-4 h-4" />
            Cards {includeCards ? 'On' : 'Off'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <StatsCards
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            netBalance={netBalance}
            savingsRate={savingsRate}
            netAccountBalance={netAccountBalance}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SpendingChart
              dailyData={dailyData}
              weeklyData={weeklyData}
              monthlyData={monthlyData}
              categoryData={categoryData}
              selectedMonth={MONTH_NAMES[month - 1]}
            />
            <BudgetProgress budgets={budgetProgress} />
          </div>

          <RecentTransactions transactions={monthTx.slice(0, 8)} />
        </>
      )}
    </div>
  )
}
