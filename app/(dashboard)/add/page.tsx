'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDownCircle, ArrowUpCircle, LayoutDashboard, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TransactionModal = dynamic(() => import('@/components/transactions/TransactionModal'), { ssr: false })

// A one-tap entry point for the home screen: opens the add form straight away
// (?type=expense|income) and keeps two big buttons ready for the next entry.
function QuickAdd() {
  const params = useSearchParams()
  const initial = params.get('type') === 'income' ? 'income' : params.get('type') === 'expense' ? 'expense' : null
  const [open, setOpen] = useState<'income' | 'expense' | null>(initial)
  const [added, setAdded] = useState(0)

  return (
    <div className="mx-auto max-w-md space-y-6 pt-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Quick add</h1>
        <p className="text-sm text-muted-foreground">
          {added > 0 ? `${added} added this visit` : 'Record a transaction in a few taps'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button className="h-24 flex-col gap-2 text-base" onClick={() => setOpen('expense')}>
          <ArrowUpCircle className="w-7 h-7" /> Expense
        </Button>
        <Button variant="outline" className="h-24 flex-col gap-2 text-base" onClick={() => setOpen('income')}>
          <ArrowDownCircle className="w-7 h-7" /> Income
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Link href="/dashboard"><Button variant="ghost" size="sm"><LayoutDashboard className="w-4 h-4 mr-1.5" /> Dashboard</Button></Link>
        <Link href="/transactions"><Button variant="ghost" size="sm"><List className="w-4 h-4 mr-1.5" /> All transactions</Button></Link>
      </div>

      {open && (
        <TransactionModal
          open
          defaultType={open}
          transaction={null}
          onClose={() => setOpen(null)}
          onSaved={() => { setAdded(n => n + 1); toast.success('Transaction added') }}
        />
      )}
    </div>
  )
}

export default function QuickAddPage() {
  return <Suspense><QuickAdd /></Suspense>
}
