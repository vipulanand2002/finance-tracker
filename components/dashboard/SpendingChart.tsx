'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { CategoryTotal, MonthlyData } from '@/types'

interface Props {
  dailyData: MonthlyData[]
  weeklyData: MonthlyData[]
  monthlyData: MonthlyData[]
  categoryData: CategoryTotal[]
  selectedMonth: string
  selectedCategory?: string | null
  onCategorySelect?: (category: string | null) => void
}

type Period = 'day' | 'week' | 'month'

function currency(v: number) { return formatCurrency(v, true) }

// Compact axis labels: ₹80k / ₹1.5L so they fit in the narrow Y-axis column on mobile
function axisLabel(v: number): string {
  if (v >= 100000) return `₹${(v / 100000) % 1 === 0 ? v / 100000 : (v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000) % 1 === 0 ? v / 1000 : (v / 1000).toFixed(1)}k`
  return `₹${v}`
}

export default function SpendingChart({ dailyData, weeklyData, monthlyData, categoryData, selectedMonth, selectedCategory, onCategorySelect }: Props) {
  const [period, setPeriod] = useState<Period>('month')

  const trendData = period === 'day' ? dailyData : period === 'week' ? weeklyData : monthlyData

  // For day view with 28-31 points, only show every 5th tick to avoid crowding
  const xAxisProps = period === 'day'
    ? { dataKey: 'month', tick: { fontSize: 11 }, interval: 4 }
    : { dataKey: 'month', tick: { fontSize: 12 }, interval: 0 }

  const periodLabel = period === 'day'
    ? `Daily — ${selectedMonth}`
    : period === 'week'
      ? 'Last 8 Weeks'
      : 'Last 6 Months'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trend">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="trend" className="flex-1 sm:flex-none">Trend</TabsTrigger>
            <TabsTrigger value="categories" className="flex-1 sm:flex-none">
              <span className="hidden sm:inline">By Category ({selectedMonth})</span>
              <span className="sm:hidden">Categories</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trend">
            {/* Period toggle */}
            <div className="flex flex-wrap items-center gap-1 mb-4">
              <span className="text-xs text-muted-foreground mr-1">View:</span>
              {(['day', 'week', 'month'] as Period[]).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? 'default' : 'outline'}
                  className="h-7 px-3 text-xs capitalize"
                  onClick={() => setPeriod(p)}
                >
                  {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : 'Monthly'}
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{periodLabel}</span>
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis {...xAxisProps} />
                <YAxis tickFormatter={axisLabel} tick={{ fontSize: 11 }} width={44} />
                <Tooltip formatter={(v) => currency(Number(v) || 0)} labelFormatter={label => `${period === 'day' ? 'Day ' : period === 'week' ? 'Week of ' : ''}${label}`} />
                <Legend />
                <Area type="monotone" dataKey="income" name="Income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="categories">
            {categoryData.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                No expense data for {selectedMonth}
              </div>
            ) : (
              <>
                {selectedCategory && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Showing <span className="font-medium text-foreground">{selectedCategory}</span> · click slice again to clear
                  </p>
                )}
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="42%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      style={{ cursor: onCategorySelect ? 'pointer' : 'default' }}
                      onClick={(data) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const cat = (data as any).category as string | undefined
                        if (cat) onCategorySelect?.(selectedCategory === cat ? null : cat)
                      }}
                    >
                      {categoryData.map(({ category }) => (
                        <Cell
                          key={category}
                          fill={CATEGORY_COLORS[category] ?? '#94a3b8'}
                          opacity={!selectedCategory || selectedCategory === category ? 1 : 0.35}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => currency(Number(v) || 0)} />
                    <Legend
                      formatter={v => <span className="text-xs">{v}</span>}
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
