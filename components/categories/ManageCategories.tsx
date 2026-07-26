'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'

interface UserCategory {
  id: string
  name: string
  list_type: 'expense' | 'income'
}

// ── Module-level component so React never remounts it on parent re-renders ──
// (Defining components inside another component causes React to see a new type
//  every render, unmounting the DOM node and losing input focus.)
interface TabContentProps {
  type: 'expense' | 'income'
  categories: UserCategory[]
  adding: boolean
  confirmId: string | null
  deleting: string | null
  onAdd: (name: string) => Promise<void>
  onRequestDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
}

function CategoryTabContent({
  type,
  categories,
  adding,
  confirmId,
  deleting,
  onAdd,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: TabContentProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAdd() {
    const name = value.trim()
    if (!name) return
    setValue('')
    await onAdd(name)
    // Restore focus after state update
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder={`New ${type} category…`}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        />
        <Button size="sm" onClick={handleAdd} disabled={!value.trim() || adding} className="shrink-0">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Category list */}
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No {type} categories. Add one above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {categories.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <span className="text-sm flex-1 truncate">{c.name}</span>

              {confirmId === c.id ? (
                // Inline confirmation row
                <div className="flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs text-destructive font-medium">Delete?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 text-xs"
                    disabled={deleting === c.id}
                    onClick={() => onConfirmDelete(c.id)}
                  >
                    {deleting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={onCancelDelete}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => onRequestDelete(c.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main dialog ──
interface Props {
  open: boolean
  onClose: () => void
  onChanged?: () => void
}

export function ManageCategories({ open, onClose, onChanged }: Props) {
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setConfirmId(null); return }
    setLoading(true)
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load categories'))
      .finally(() => setLoading(false))
  }, [open])

  const addCategory = useCallback(async (name: string, listType: 'expense' | 'income') => {
    setAdding(true)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, list_type: listType }),
    })
    const d = await res.json()
    if (res.ok) {
      setCategories(prev => [...prev, d])
      onChanged?.()
    } else {
      toast.error(d.error ?? 'Failed to add category')
    }
    setAdding(false)
  }, [onChanged])

  const addExpense = useCallback((name: string) => addCategory(name, 'expense'), [addCategory])
  const addIncome = useCallback((name: string) => addCategory(name, 'income'), [addCategory])

  async function confirmDelete(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== id))
      onChanged?.()
    } else {
      toast.error('Failed to delete category')
    }
    setDeleting(null)
    setConfirmId(null)
  }

  const expenseCategories = categories.filter(c => c.list_type === 'expense')
  const incomeCategories = categories.filter(c => c.list_type === 'income')

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="expense" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">
                Expense ({expenseCategories.length})
              </TabsTrigger>
              <TabsTrigger value="income" className="flex-1">
                Income ({incomeCategories.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="expense" className="mt-4">
              <CategoryTabContent
                type="expense"
                categories={expenseCategories}
                adding={adding}
                confirmId={confirmId}
                deleting={deleting}
                onAdd={addExpense}
                onRequestDelete={id => { setConfirmId(id) }}
                onConfirmDelete={confirmDelete}
                onCancelDelete={() => setConfirmId(null)}
              />
            </TabsContent>

            <TabsContent value="income" className="mt-4">
              <CategoryTabContent
                type="income"
                categories={incomeCategories}
                adding={adding}
                confirmId={confirmId}
                deleting={deleting}
                onAdd={addIncome}
                onRequestDelete={id => { setConfirmId(id) }}
                onConfirmDelete={confirmDelete}
                onCancelDelete={() => setConfirmId(null)}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
