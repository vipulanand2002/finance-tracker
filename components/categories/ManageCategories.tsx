'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lock, Plus, Trash2, Loader2 } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

interface UserCategory {
  id: string
  name: string
  list_type: 'expense' | 'income'
}

interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

const STATIC_EXPENSE = new Set(EXPENSE_CATEGORIES as unknown as string[])
const STATIC_INCOME = new Set(INCOME_CATEGORIES as unknown as string[])

export function ManageCategories({ open, onClose, onChanged }: Props) {
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [newExpense, setNewExpense] = useState('')
  const [newIncome, setNewIncome] = useState('')
  const [adding, setAdding] = useState<'expense' | 'income' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load categories'))
      .finally(() => setLoading(false))
  }, [open])

  async function addCategory(listType: 'expense' | 'income') {
    const name = listType === 'expense' ? newExpense.trim() : newIncome.trim()
    if (!name) return
    setAdding(listType)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, list_type: listType }),
    })
    const d = await res.json()
    if (res.ok) {
      setCategories(prev => [...prev, d])
      if (listType === 'expense') setNewExpense('')
      else setNewIncome('')
      onChanged?.()
    } else {
      toast.error(d.error ?? 'Failed to add category')
    }
    setAdding(null)
  }

  async function deleteCategory(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== id))
      onChanged?.()
    } else {
      toast.error('Failed to delete category')
    }
    setDeleting(null)
  }

  function CategoryTab({
    type,
    staticSet,
    newValue,
    setNewValue,
  }: {
    type: 'expense' | 'income'
    staticSet: Set<string>
    newValue: string
    setNewValue: (v: string) => void
  }) {
    const custom = categories.filter(c => c.list_type === type)
    const allStatic = [...staticSet]

    return (
      <div className="space-y-4">
        {/* Add new */}
        <div className="flex gap-2">
          <Input
            placeholder={`New ${type} category…`}
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory(type)}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => addCategory(type)}
            disabled={!newValue.trim() || adding === type}
          >
            {adding === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* Custom categories (deletable) */}
        {custom.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Custom</p>
            <div className="flex flex-wrap gap-2">
              {custom.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full pl-3 pr-1.5 py-1"
                >
                  <span className="text-sm">{c.name}</span>
                  <button
                    onClick={() => deleteCategory(c.id)}
                    disabled={deleting === c.id}
                    className="rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                  >
                    {deleting === c.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Static categories (read-only) */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
            <Lock className="w-3 h-3" /> Built-in (cannot be deleted)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allStatic.map(name => (
              <Badge key={name} variant="secondary" className="text-xs font-normal">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="expense" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">Expense</TabsTrigger>
              <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
            </TabsList>
            <TabsContent value="expense" className="mt-4">
              <CategoryTab
                type="expense"
                staticSet={STATIC_EXPENSE}
                newValue={newExpense}
                setNewValue={setNewExpense}
              />
            </TabsContent>
            <TabsContent value="income" className="mt-4">
              <CategoryTab
                type="income"
                staticSet={STATIC_INCOME}
                newValue={newIncome}
                setNewValue={setNewIncome}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
