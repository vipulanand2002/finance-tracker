import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Scale } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  totalIncome: number
  totalExpenses: number
  netBalance: number
  savingsRate: number
  netAccountBalance: number | null
}

export default function StatsCards({ totalIncome, totalExpenses, netBalance, savingsRate, netAccountBalance }: Props) {
  const monthlyCards = [
    {
      title: 'Income This Month',
      value: formatCurrency(totalIncome),
      icon: TrendingUp,
      iconClass: 'text-emerald-500',
      subtext: 'Total received',
    },
    {
      title: 'Expenses This Month',
      value: formatCurrency(totalExpenses),
      icon: TrendingDown,
      iconClass: 'text-red-500',
      subtext: 'Total spent',
    },
    {
      title: 'Net This Month',
      value: formatCurrency(netBalance),
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

  const isPositive = netAccountBalance !== null && netAccountBalance >= 0

  return (
    <div className="space-y-4">
      {/* All-time net account balance — full-width highlight card */}
      <Card className={`border-2 ${netAccountBalance === null ? 'border-border' : isPositive ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
        <CardContent className="flex items-center justify-between py-5 px-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Net Account Balance</p>
            <p className={`text-3xl font-bold mt-1 ${netAccountBalance === null ? 'text-muted-foreground' : isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {netAccountBalance === null ? '—' : formatCurrency(netAccountBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {netAccountBalance === null
                ? 'Loading…'
                : isPositive
                  ? 'All-time surplus — you\'re ahead!'
                  : 'All-time deficit — spending exceeds income'}
            </p>
          </div>
          <Scale className={`w-10 h-10 opacity-20 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`} />
        </CardContent>
      </Card>

      {/* Monthly stats — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {monthlyCards.map(({ title, value, icon: Icon, iconClass, subtext }) => (
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
    </div>
  )
}
