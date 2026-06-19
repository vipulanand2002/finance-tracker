'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'

interface Participant { name: string; email: string; amount: string }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  defaultTitle?: string
  defaultAmount?: string | number
  tripId?: string | null
}

const emptyParticipant = (): Participant => ({ name: '', email: '', amount: '' })

export default function SplitModal({ open, onClose, onSaved, defaultTitle, defaultAmount, tripId }: Props) {
  const [title, setTitle] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [category, setCategory] = useState('Food & Dining')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [participants, setParticipants] = useState<Participant[]>([emptyParticipant(), emptyParticipant()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? '')
      setTotalAmount(defaultAmount != null ? String(defaultAmount) : '')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setCategory('Food & Dining')
      setDescription('')
      setParticipants([emptyParticipant(), emptyParticipant()])
    }
  }, [open, defaultTitle, defaultAmount])

  function reset() {
    setTitle(''); setTotalAmount(''); setCategory('Food & Dining')
    setDescription(''); setDate(format(new Date(), 'yyyy-MM-dd'))
    setParticipants([emptyParticipant(), emptyParticipant()])
  }

  function splitEqually() {
    const total = parseFloat(totalAmount)
    if (!total || participants.length === 0) return
    const each = (total / participants.length).toFixed(2)
    setParticipants(p => p.map(pt => ({ ...pt, amount: each })))
  }

  function updateParticipant(i: number, key: keyof Participant, val: string) {
    setParticipants(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p))
  }

  function addParticipant() { setParticipants(p => [...p, emptyParticipant()]) }
  function removeParticipant(i: number) { setParticipants(p => p.filter((_, idx) => idx !== i)) }

  const allocatedTotal = participants.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const total = parseFloat(totalAmount) || 0
  const diff = total - allocatedTotal

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validParticipants = participants.filter(p => p.name.trim() && p.amount)
    if (!title || !totalAmount || validParticipants.length === 0) {
      toast.error('Fill in title, amount, and at least one participant')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, total_amount: total, category, description: description || null, date,
          trip_id: tripId ?? null,
          participants: validParticipants.map(p => ({
            name: p.name.trim(),
            email: p.email.trim() || undefined,
            amount: parseFloat(p.amount),
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Split created!')
      reset()
      onSaved()
      onClose()
    } catch {
      toast.error('Failed to create split')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split an Expense</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Title *</Label>
              <Input placeholder="e.g. Dinner at Barbeque Nation" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Total Amount (₹) *</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={v => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Input placeholder="Optional note" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Participants *</Label>
              <Button type="button" size="sm" variant="ghost" onClick={splitEqually} disabled={!totalAmount}>
                Split equally
              </Button>
            </div>

            <div className="space-y-2">
              {participants.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs mb-1 block">Name</Label>}
                    <Input placeholder="Name" value={p.name} onChange={e => updateParticipant(i, 'name', e.target.value)} />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs mb-1 block">Email (optional)</Label>}
                    <Input placeholder="email@example.com" type="email" value={p.email} onChange={e => updateParticipant(i, 'email', e.target.value)} />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs mb-1 block">Amount (₹)</Label>}
                    <Input type="number" min="0" step="0.01" placeholder="0" value={p.amount} onChange={e => updateParticipant(i, 'amount', e.target.value)} />
                  </div>
                  <button type="button" onClick={() => removeParticipant(i)} className="text-muted-foreground hover:text-destructive mt-5">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addParticipant}>
              <Plus className="w-4 h-4 mr-1" /> Add person
            </Button>

            {/* Allocation summary */}
            {total > 0 && (
              <div className={`text-xs rounded-md px-3 py-2 ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                Allocated {formatCurrency(allocatedTotal)} of {formatCurrency(total)}
                {Math.abs(diff) >= 0.01 && <span className="ml-1">({diff > 0 ? formatCurrency(diff) + ' unallocated' : formatCurrency(-diff) + ' over'})</span>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : 'Create Split'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
