'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EyeOff, Loader2, Upload, X } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRIP_EXPENSE_CATEGORIES } from '@/lib/constants'
import type { Transaction, Trip } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  transaction?: Transaction | null
  defaultTripId?: string | null
}

const emptyForm = {
  amount: '',
  type: 'expense' as 'income' | 'expense',
  category: '',
  description: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  is_recurring: false,
  is_discrete: false,
  receipt_url: '',
  trip_id: null as string | null,
}

export default function TransactionModal({ open, onClose, onSaved, transaction, defaultTripId }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/trips').then(r => r.json()).then(d => setTrips(Array.isArray(d) ? d : [])).catch(() => {})
  }, [open])

  useEffect(() => {
    if (transaction) {
      setForm({
        amount: String(transaction.amount),
        type: transaction.type,
        category: transaction.category,
        description: transaction.description ?? '',
        date: transaction.date,
        is_recurring: transaction.is_recurring,
        is_discrete: transaction.is_discrete ?? false,
        receipt_url: transaction.receipt_url ?? '',
        trip_id: transaction.trip_id ?? null,
      })
    } else {
      setForm({ ...emptyForm, trip_id: defaultTripId ?? null })
    }
  }, [transaction, open, defaultTripId])

  const categories = form.type === 'income'
    ? INCOME_CATEGORIES
    : form.trip_id
      ? TRIP_EXPENSE_CATEGORIES
      : EXPENSE_CATEGORIES

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanningReceipt(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/ai/receipt', { method: 'POST', body: fd })
      const data = await res.json()

      if (data.amount) set('amount', String(data.amount))
      if (data.description) set('description', data.description)
      if (data.category && (categories as readonly string[]).includes(data.category)) set('category', data.category as string)
      if (data.date) set('date', data.date)
      if (data.receiptUrl) set('receipt_url', data.receiptUrl)

      toast.success('Receipt scanned successfully!')
    } catch {
      toast.error('Failed to scan receipt')
    } finally {
      setScanningReceipt(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.category || !form.date) {
      toast.error('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const body = {
        amount: parseFloat(form.amount),
        type: form.type,
        category: form.category,
        description: form.description || null,
        date: form.date,
        is_recurring: form.is_recurring,
        is_discrete: form.trip_id ? form.is_discrete : false,
        receipt_url: form.receipt_url || null,
        trip_id: form.trip_id || null,
      }

      const url = transaction ? `/api/transactions?id=${transaction.id}` : '/api/transactions'
      const method = transaction ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to save')

      toast.success(transaction ? 'Transaction updated' : 'Transaction added')
      onSaved()
      onClose()
    } catch {
      toast.error('Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Type toggle — income is not applicable in trip context */}
          {!form.trip_id && (
            <div className="flex gap-2">
              {(['expense', 'income'] as const).map(t => (
                <Button
                  key={t}
                  type="button"
                  variant={form.type === t ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 capitalize"
                  onClick={() => { set('type', t); set('category', '') }}
                >
                  {t}
                </Button>
              ))}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={form.category} onValueChange={v => v && set('category', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What was this for?"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              required
            />
          </div>

          {/* Trip */}
          {trips.length > 0 && (
            <div className="space-y-1">
              <Label>Trip <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Select
                value={form.trip_id ?? 'none'}
                onValueChange={v => {
                  const tripSelected = v !== 'none'
                  set('trip_id', tripSelected ? v : null)
                  if (tripSelected) {
                    set('type', 'expense')
                    // Reset category if it's not in the trip-specific list
                    if (!TRIP_EXPENSE_CATEGORIES.includes(form.category as typeof TRIP_EXPENSE_CATEGORIES[number])) {
                      set('category', '')
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to a trip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trip</SelectItem>
                  {trips.filter(t => !t.is_closed).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Recurring */}
          <div className="flex items-center gap-2">
            <input
              id="recurring"
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={form.is_recurring}
              onChange={e => set('is_recurring', e.target.checked)}
            />
            <Label htmlFor="recurring" className="cursor-pointer font-normal">
              Recurring transaction
            </Label>
            {form.is_recurring && <Badge variant="secondary" className="text-xs">Monthly</Badge>}
          </div>

          {/* Discrete expense toggle — only relevant when linked to a trip */}
          {form.trip_id && form.type === 'expense' && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors ${form.is_discrete ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950' : 'border-muted'}`}>
              <input
                id="discrete"
                type="checkbox"
                className="w-4 h-4 rounded mt-0.5 accent-amber-500"
                checked={form.is_discrete}
                onChange={e => set('is_discrete', e.target.checked)}
              />
              <div>
                <Label htmlFor="discrete" className="cursor-pointer font-medium flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                  Private expense
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Counts toward your personal budget only — hidden from other trip members and excluded from the trip total.
                </p>
              </div>
            </div>
          )}

          {/* Receipt upload (expense only) */}
          {form.type === 'expense' && (
            <div className="space-y-1">
              <Label>Receipt (optional)</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleReceiptUpload} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileRef.current?.click()}
                disabled={scanningReceipt}
              >
                {scanningReceipt ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning receipt…</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Upload & Scan Receipt</>
                )}
              </Button>
              {form.receipt_url && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  Receipt attached
                  <button type="button" onClick={() => set('receipt_url', '')}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : transaction ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
