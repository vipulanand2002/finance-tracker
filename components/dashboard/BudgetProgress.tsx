import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import type { BudgetWithSpent } from '@/types'

function currency(n: number) { return formatCurrency(n, true) }

export default function BudgetProgress({ budgets }: { budgets: BudgetWithSpent[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Budget Overview</CardTitle>
        <Link href="/budgets" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {budgets.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">No budgets set for this month</p>
            <Link href="/budgets" className={cn(buttonVariants({ size: 'sm' }))}>
              Set budgets
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {budgets.slice(0, 5).map(b => {
              const pct = Math.min((b.spent / b.amount) * 100, 100)
              const over = b.spent > b.amount
              return (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{b.category}</span>
                    <span className={over ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      {currency(b.spent)} / {currency(b.amount)}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className={over ? '[&>div]:bg-red-500' : pct > 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}
                  />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
