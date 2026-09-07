'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import { FriendPicker } from '@/components/friends/FriendPicker'
import type { Friend, Trip } from '@/types'

interface Participant { name: string; email: string; amount: string }
interface CardInfo { id: string; card_name: string }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  defaultTitle?: string
  defaultAmount?: string | number
  tripId?: string | null
  contactId?: string | null
  defaultParticipants?: { name: string; email: string }[]
}

const emptyParticipant = (): Participant => ({ name: '', email: '', amount: '' })

export default function SplitModal({ open, onClose, onSaved, defaultTitle, defaultAmount, tripId, contactId, defaultParticipants }: Props) {
  const [title, setTitle] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [category, setCategory] = useState('Food & Dining')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [participants, setParticipants] = useState<Participant[]>([emptyParticipant(), emptyParticipant()])
  const [saving, setSaving] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [myEmail, setMyEmail] = useState('')
  const [myName, setMyName] = useState('')
  const [trips, setTrips] = useState<Trip[]>([])
  const [cards, setCards] = useState<CardInfo[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetch('/api/friends').then(r => r.json()).then(d => setFriends(Array.isArray(d) ? d : [])).catch(() => {})
      fetch('/api/trips').then(r => r.json()).then(d => setTrips(Array.isArray(d) ? d : [])).catch(() => {})
      fetch('/api/cards').then(r => r.json()).then(d => setCards(Array.isArray(d) ? d : [])).catch(() => {})
      createClient().auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setMyEmail(user.email.toLowerCase())
          setMyName(user.email.split('@')[0])
        }
      })
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? '')
      setTotalAmount(defaultAmount != null ? String(defaultAmount) : '')
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setCategory('Food & Dining')
      setDescription('')
      setSelectedTripId(tripId ?? null)
      setSelectedCardId(null)
      if (defaultParticipants && defaultParticipants.length > 0) {
        const pre = defaultParticipants.map(p => ({ name: p.name || p.email.split('@')[0], email: p.email, amount: '' }))
        setParticipants(pre.length >= 2 ? pre : [...pre, emptyParticipant()])
      } else {
        setParticipants([emptyParticipant(), emptyParticipant()])
      }
    }
  }, [open, defaultTitle, defaultAmount, defaultParticipants, tripId])

  function reset() {
    setTitle(''); setTotalAmount(''); setCategory('Food & Dining')
    setDescription(''); setDate(format(new Date(), 'yyyy-MM-dd'))
    setParticipants([emptyParticipant(), emptyParticipant()])
    setSelectedTripId(null); setSelectedCardId(null)
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

  function addFriendAsParticipant(friend: Friend) {
    const emptyIdx = participants.findIndex(p => !p.name && !p.email)
    const alreadyAdded = participants.some(p => p.email === friend.email)
    if (alreadyAdded) { toast.error(`${friend.email} is already added`); return }
    const newRow: Participant = { name: friend.email.split('@')[0], email: friend.email, amount: '' }
    if (emptyIdx !== -1) {
      setParticipants(prev => prev.map((p, i) => i === emptyIdx ? newRow : p))
    } else {
      setParticipants(prev => [...prev, newRow])
    }
  }

  const allocatedTotal = participants.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const total = parseFloat(totalAmount) || 0
  const diff = total - allocatedTotal

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validParticipants = participants.filter(p => p.name.trim() && parseFloat(p.amount) > 0)
    if (!title.trim()) { toast.error('Enter a title'); return }
    if (total <= 0) { toast.error('Amount must be greater than 0'); return }
    if (validParticipants.length === 0) { toast.error('Add at least one participant with an amount'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), total_amount: total, category, description: description || null, date,
          trip_id: selectedTripId ?? null,
          card_id: selectedCardId ?? null,
          contact_id: contactId ?? null,
          participants: validParticipants.map(p => ({
            name: p.name.trim(),
            email: p.email.trim() || undefined,
            amount: parseFloat(p.amount),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      toast.success('Split created!')
      reset()
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create split')
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

            {/* Trip association */}
            {trips.length > 0 && (
              <div className="col-span-2 space-y-1">
                <Label>Trip <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select
                  key={`trip-${trips.length}`}
                  value={selectedTripId ?? 'none'}
                  onValueChange={v => setSelectedTripId(v === 'none' ? null : v)}
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

            {/* Card association */}
            {cards.length > 0 && (
              <div className="col-span-2 space-y-1">
                <Label>Card <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select
                  key={`card-${cards.length}`}
                  value={selectedCardId ?? 'none'}
                  onValueChange={v => setSelectedCardId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Link to a card" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No card</SelectItem>
                    {cards.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Participants *</Label>
              <Button type="button" size="sm" variant="ghost" onClick={splitEqually} disabled={!totalAmount}>
                Split equally
              </Button>
            </div>

            {/* Quick-add from friends */}
            <FriendPicker
              friends={friends}
              isSelected={email => participants.some(p => p.email === email)}
              onSelect={addFriendAsParticipant}
              placeholder="Search friends to add as participant…"
            />

            <div className="space-y-2">
              {participants.map((p, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => removeParticipant(i)}
                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Name + Amount side by side */}
                  <div className="grid grid-cols-[1fr_100px] gap-2 pr-7">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name *</Label>
                      <Input
                        placeholder="Person's name"
                        value={p.name}
                        onChange={e => updateParticipant(i, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={p.amount}
                        onChange={e => updateParticipant(i, 'amount', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email full width below */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Email <span className="text-muted-foreground/60">(optional — for notifications)</span>
                    </Label>
                    <Input
                      placeholder="email@example.com"
                      type="email"
                      value={p.email}
                      onChange={e => updateParticipant(i, 'email', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addParticipant}>
                <Plus className="w-4 h-4 mr-1" /> Add person
              </Button>
              {myEmail && !participants.some(p => p.email.toLowerCase() === myEmail) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setParticipants(prev => [{ name: myName, email: myEmail, amount: '' }, ...prev])}
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Add me
                </Button>
              )}
            </div>

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
