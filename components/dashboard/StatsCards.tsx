import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

function fmt(n: number) { return formatCurrency(n) }

interface Props {
  totalIncome: number
  totalExpenses: number
  netBalance: number
  savingsRate: number
}

export default function StatsCards({ totalIncome, totalExpenses, netBalance, savingsRate }: Props) {
  const cards = [
    {
      title: 'Total Income',
      value: fmt(totalIncome),
      icon: TrendingUp,
      iconClass: 'text-emerald-500',
      subtext: 'This month',
    },
    {
      title: 'Total Expenses',
      value: fmt(totalExpenses),
      icon: TrendingDown,
      iconClass: 'text-red-500',
      subtext: 'This month',
    },
    {
      title: 'Net Balance',
      value: fmt(netBalance),
      icon: Wallet,
      iconClass: netBalance >= 0 ? 'text-emerald-500' : 'text-red-500',
      subtext: netBalance >= 0 ? 'Positive cashflow' : 'Overspent',
    },
    {
      title: 'Savings Rate',
      value: `${savingsRate.toFixed(1)}%`,
      icon: PiggyBank,
      iconClass: savingsRate >= 20 ? 'text-emerald-500' : savingsRate >= 10 ? 'text-amber-500' : 'text-red-500',
      subtext: savingsRate >= 20 ? 'Great job!' : savingsRate >= 10 ? 'Room to improve' : 'Try to save more',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ title, value, icon: Icon, iconClass, subtext }) => (
        <Card key={title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className={`w-4 h-4 ${iconClass}`} />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
