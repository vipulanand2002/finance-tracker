import { createClient } from '@/lib/supabase/server'
import { format, subMonths, startOfMonth } from 'date-fns'
import StatsCards from '@/components/dashboard/StatsCards'
import SpendingChart from '@/components/dashboard/SpendingChart'
import RecentTransactions from '@/components/dashboard/RecentTransactions'
import BudgetProgress from '@/components/dashboard/BudgetProgress'
import type { Transaction, Budget, BudgetWithSpent, CategoryTotal, MonthlyData } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const startMonth = format(startOfMonth(now), 'yyyy-MM-dd')
  const sixMonthsAgo = format(subMonths(startOfMonth(now), 5), 'yyyy-MM-dd')

  const [{ data: allTx }, { data: monthTx }, { data: budgets }] = await Promise.all([
    supabase.from('transactions').select('*').gte('date', sixMonthsAgo).order('date', { ascending: false }),
    supabase.from('transactions').select('*').gte('date', startMonth).order('date', { ascending: false }),
    supabase.from('budgets').select('*').eq('month', currentMonth).eq('year', currentYear),
  ])

  const allTransactions: Transaction[] = allTx ?? []
  const monthTransactions: Transaction[] = monthTx ?? []
  const monthBudgets: Budget[] = budgets ?? []

  // Stats
  const totalIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netBalance = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0

  // Category breakdown (current month expenses)
  const catMap: Record<string, number> = {}
  monthTransactions.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] ?? 0) + t.amount
  })
  const categoryData: CategoryTotal[] = Object.entries(catMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  // Monthly trend (last 6 months)
  const monthlyData: MonthlyData[] = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i)
    const prefix = format(d, 'yyyy-MM')
    return {
      month: format(d, 'MMM'),
      income: allTransactions.filter(t => t.type === 'income' && t.date.startsWith(prefix)).reduce((s, t) => s + t.amount, 0),
      expenses: allTransactions.filter(t => t.type === 'expense' && t.date.startsWith(prefix)).reduce((s, t) => s + t.amount, 0),
    }
  })

  // Budget + spent
  const budgetProgress: BudgetWithSpent[] = monthBudgets.map(b => ({
    ...b,
    spent: monthTransactions.filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + t.amount, 0),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">{format(now, 'MMMM yyyy')} overview</p>
      </div>

      <StatsCards
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netBalance}
        savingsRate={savingsRate}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SpendingChart monthlyData={monthlyData} categoryData={categoryData} />
        <BudgetProgress budgets={budgetProgress} />
      </div>

      <RecentTransactions transactions={monthTransactions.slice(0, 8)} />
    </div>
  )
}
