'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, BrainCircuit, Loader2 } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Budget, Transaction } from '@/types'

function currency(n: number) { return formatCurrency(n, true) }

interface BudgetWithSpent extends Budget { spent: number }

export default function BudgetsPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [budgetRes, txRes] = await Promise.all([
        fetch(`/api/budgets?month=${month}&year=${year}`),
        fetch(`/api/transactions?exclude_card=true`),
      ])
      const [rawBudgets, rawTx]: [Budget[], Transaction[]] = await Promise.all([
        budgetRes.json(),
        txRes.json(),
      ])

      const monthTx = (rawTx ?? []).filter(t => {
        const d = new Date(t.date + 'T00:00:00')
        return d.getMonth() + 1 === month && d.getFullYear() === year
      })

      const withSpent: BudgetWithSpent[] = (rawBudgets ?? []).map(b => ({
        ...b,
        spent: monthTx.filter(t => (t.type === 'expense' || t.category === 'Card Payment') && t.category === b.category).reduce((s, t) => s + t.amount, 0),
      }))

      setBudgets(withSpent)
    } catch {
      toast.error('Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newCategory || !newAmount) return

    setSaving(true)
    try {
      await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory, amount: parseFloat(newAmount), month, year }),
      })
      toast.success('Budget saved')
      setModalOpen(false)
      setNewCategory('')
      setNewAmount('')
      fetchData()
    } catch {
      toast.error('Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this budget?')) return
    await fetch(`/api/budgets?id=${id}`, { method: 'DELETE' })
    toast.success('Budget removed')
    fetchData()
  }

  async function getAiRecommendations() {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/insights?type=budget')
      const data = await res.json()
      if (data.budgetRecommendations?.length) {
        for (const rec of data.budgetRecommendations) {
          await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: rec.category, amount: rec.amount, month, year }),
          })
        }
        toast.success(`Applied ${data.budgetRecommendations.length} AI budget recommendations`)
        fetchData()
      } else {
        toast.info('Not enough transaction history for recommendations. Add some transactions first!')
      }
    } catch {
      toast.error('Failed to get AI recommendations')
    } finally {
      setAiLoading(false)
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), 'MMMM'),
  }))

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-muted-foreground text-sm">Set and track monthly spending limits</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={v => v && setMonth(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="w-24"
            min={2020}
            max={2099}
          />
          <Button variant="outline" onClick={getAiRecommendations} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
            AI Suggest
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Budget
          </Button>
        </div>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Budgeted</p>
              <p className="text-xl font-bold">{currency(totalBudgeted)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Spent</p>
              <p className={`text-xl font-bold ${totalSpent > totalBudgeted ? 'text-red-500' : 'text-foreground'}`}>
                {currency(totalSpent)}
              </p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className={`text-xl font-bold ${totalBudgeted - totalSpent < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {currency(totalBudgeted - totalSpent)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">No budgets set for this month.</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add manually
              </Button>
              <Button variant="outline" onClick={getAiRecommendations} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
                AI Suggest
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map(b => {
            const pct = Math.min((b.spent / b.amount) * 100, 100)
            const over = b.spent > b.amount
            return (
              <Card key={b.id}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">{b.category}</CardTitle>
                  <div className="flex items-center gap-1">
                    {over && <Badge variant="destructive" className="text-xs">Over budget</Badge>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(b.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-2">
                    <span className={over ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
                      {currency(b.spent)} spent
                    </span>
                    <span className="text-muted-foreground">{currency(b.amount)} limit</span>
                  </div>
                  <Progress
                    value={pct}
                    className={over ? '[&>div]:bg-red-500' : pct > 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {over
                      ? `${currency(b.spent - b.amount)} over limit`
                      : `${currency(b.amount - b.spent)} remaining`}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add budget modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Budget</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={v => v && setNewCategory(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.filter(c => !budgets.some(b => b.category === c)).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="budget-amount">Monthly Limit ($)</Label>
              <Input
                id="budget-amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="0.00"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
