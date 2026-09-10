'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, UserPlus, Paperclip, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import { FriendPicker } from '@/components/friends/FriendPicker'
import type { Friend, Trip } from '@/types'

interface Participant { name: string; email: string; amount: string; isPaid?: boolean }
interface CardInfo { id: string; card_name: string }

export interface EditingSplit {
  id: string
  title: string
  total_amount: number
  category: string
  description: string | null
  date: string
  trip_id?: string | null
  contact_id?: string | null
  receipt_url?: string | null
  card_id?: string | null
  split_participants: { participant_name: string; participant_email: string | null; amount_owed: number; is_paid: boolean }[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  defaultTitle?: string
  defaultAmount?: string | number
  tripId?: string | null
  contactId?: string | null
  defaultParticipants?: { name: string; email: string }[]
  editingSplit?: EditingSplit | null
}

const emptyParticipant = (): Participant => ({ name: '', email: '', amount: '' })

export default function SplitModal({ open, onClose, onSaved, defaultTitle, defaultAmount, tripId, contactId, defaultParticipants, editingSplit }: Props) {
  const [title, setTitle] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [category, setCategory] = useState('Food & Dining')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [participants, setParticipants] = useState<Participant[]>([emptyParticipant(), emptyParticipant()])
  const [saving, setSaving] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptName, setReceiptName] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [myEmail, setMyEmail] = useState('')
  const [myName, setMyName] = useState('')
  const [trips, setTrips] = useState<Trip[]>([])
  const [cards, setCards] = useState<CardInfo[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const discardRef = useRef(false)
  const originalRef = useRef<{
    title: string; totalAmount: string; category: string; description: string;
    date: string; selectedTripId: string | null; selectedCardId: string | null; receiptUrl: string; participants: string
  } | null>(null)

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
      if (editingSplit) {
        // Edit mode — populate from existing split
        const editParticipants = editingSplit.split_participants.map(p => ({
          name: p.participant_name,
          email: p.participant_email ?? '',
          amount: String(p.amount_owed),
          isPaid: p.is_paid,
        }))
        setTitle(editingSplit.title)
        setTotalAmount(String(editingSplit.total_amount))
        setCategory(editingSplit.category)
        setDescription(editingSplit.description ?? '')
        setDate(editingSplit.date)
        setSelectedTripId(editingSplit.trip_id ?? null)
        setSelectedCardId(editingSplit.card_id ?? null)
        setReceiptUrl(editingSplit.receipt_url ?? '')
        setReceiptName(editingSplit.receipt_url ? decodeURIComponent(editingSplit.receipt_url.split('/').pop() ?? '') : '')
        setParticipants(editParticipants)
        originalRef.current = {
          title: editingSplit.title,
          totalAmount: String(editingSplit.total_amount),
          category: editingSplit.category,
          description: editingSplit.description ?? '',
          date: editingSplit.date,
          selectedTripId: editingSplit.trip_id ?? null,
          selectedCardId: editingSplit.card_id ?? null,
          receiptUrl: editingSplit.receipt_url ?? '',
          participants: JSON.stringify(editParticipants),
        }
      } else {
        // Create mode
        const initTitle = defaultTitle ?? ''
        const initAmount = defaultAmount != null ? String(defaultAmount) : ''
        const initCategory = 'Food & Dining'
        const initDate = format(new Date(), 'yyyy-MM-dd')
        const initTripId = tripId ?? null
        let initParticipants: Participant[]
        if (defaultParticipants && defaultParticipants.length > 0) {
          const pre = defaultParticipants.map(p => ({ name: p.name || p.email.split('@')[0], email: p.email, amount: '' }))
          initParticipants = pre.length >= 2 ? pre : [...pre, emptyParticipant()]
        } else {
          initParticipants = [emptyParticipant(), emptyParticipant()]
        }
        setTitle(initTitle)
        setTotalAmount(initAmount)
        setDate(initDate)
        setCategory(initCategory)
        setDescription('')
        setSelectedTripId(initTripId)
        setSelectedCardId(null)
        setReceiptUrl('')
        setReceiptName('')
        setParticipants(initParticipants)
        originalRef.current = {
          title: initTitle,
          totalAmount: initAmount,
          category: initCategory,
          description: '',
          date: initDate,
          selectedTripId: initTripId,
          selectedCardId: null,
          receiptUrl: '',
          participants: JSON.stringify(initParticipants),
        }
      }
    }
  }, [open, editingSplit, defaultTitle, defaultAmount, defaultParticipants, tripId])

  function reset() {
    setTitle(''); setTotalAmount(''); setCategory('Food & Dining')
    setDescription(''); setDate(format(new Date(), 'yyyy-MM-dd'))
    setParticipants([emptyParticipant(), emptyParticipant()])
    setSelectedTripId(null); setSelectedCardId(null)
    setReceiptUrl(''); setReceiptName('')
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/splits/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setReceiptUrl(data.url)
      setReceiptName(data.name)
      toast.success('File attached!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
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

  async function doSubmit() {
    const validParticipants = participants.filter(p => p.name.trim() && parseFloat(p.amount) > 0)
    if (!title.trim()) { toast.warning('Enter a title to save'); return }
    if (total <= 0) { toast.warning('Enter a total amount to save'); return }
    if (validParticipants.length === 0) { toast.warning('Add at least one participant with an amount to save'); return }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(), total_amount: total, category, description: description || null, date,
        trip_id: selectedTripId ?? null,
        contact_id: contactId ?? editingSplit?.contact_id ?? null,
        receipt_url: receiptUrl || null,
        participants: validParticipants.map(p => ({
          name: p.name.trim(),
          email: p.email.trim() || undefined,
          amount: parseFloat(p.amount),
        })),
      }

      const res = editingSplit
        ? await fetch(`/api/splits?id=${editingSplit.id}&type=update`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, card_id: selectedCardId ?? null }),
          })
        : await fetch('/api/splits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, card_id: selectedCardId ?? null }),
          })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      toast.success(editingSplit ? 'Split updated!' : 'Split created!')
      reset()
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (editingSplit ? 'Failed to update split' : 'Failed to create split'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await doSubmit()
  }

  function handleCloseAttempt() {
    if (saving) return
    const orig = originalRef.current
    if (orig) {
      const hasChanges =
        title !== orig.title ||
        totalAmount !== orig.totalAmount ||
        category !== orig.category ||
        description !== orig.description ||
        date !== orig.date ||
        selectedTripId !== orig.selectedTripId ||
        selectedCardId !== orig.selectedCardId ||
        receiptUrl !== orig.receiptUrl ||
        JSON.stringify(participants) !== orig.participants
      if (!hasChanges) { reset(); onClose(); return }
    }
    doSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleCloseAttempt() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingSplit ? 'Edit Split' : 'Split an Expense'}</DialogTitle>
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

            {/* Attachment */}
            <div className="col-span-2 space-y-1">
              <Label>Attachment <span className="text-muted-foreground font-normal text-xs">(PDF or image · attached to reminder emails)</span></Label>
              {receiptUrl ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-xs text-primary hover:underline">
                    {receiptName || 'Attachment'}
                  </a>
                  <button type="button" onClick={() => { setReceiptUrl(''); setReceiptName('') }} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors ${uploadingFile ? 'pointer-events-none opacity-60' : ''}`}>
                  {uploadingFile
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</>
                    : <><Upload className="w-3.5 h-3.5" />Attach PDF or image</>}
                  <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                </label>
              )}
            </div>

            {/* Trip association */}
            {trips.length > 0 && (
              <div className="col-span-2 space-y-1">
                <Label>Trip <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Select
                  value={selectedTripId ?? 'none'}
                  onValueChange={v => setSelectedTripId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <span className="truncate text-sm">
                      {selectedTripId
                        ? (trips.find(t => t.id === selectedTripId)?.name ?? '…')
                        : <span className="text-muted-foreground">No trip</span>}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No trip</SelectItem>
                    {trips.filter(t => !t.is_closed || t.id === selectedTripId).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}{t.is_closed ? ' (closed)' : ''}</SelectItem>
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
                  value={selectedCardId ?? 'none'}
                  onValueChange={v => setSelectedCardId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <span className="truncate text-sm">
                      {selectedCardId
                        ? (cards.find(c => c.id === selectedCardId)?.card_name ?? '…')
                        : <span className="text-muted-foreground">No card</span>}
                    </span>
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
                  {!p.isPaid && (
                    <button
                      type="button"
                      onClick={() => removeParticipant(i)}
                      className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {p.isPaid && (
                    <span className="absolute top-2.5 right-2.5 text-xs text-emerald-600 font-medium">Paid</span>
                  )}

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

          <DialogFooter className="flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground order-last sm:order-first">Closes and saves automatically</p>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose() }}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{editingSplit ? 'Saving…' : 'Creating…'}</> : 'Cancel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
