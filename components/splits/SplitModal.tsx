'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, UserPlus, Paperclip, Upload, X, Bold, List } from 'lucide-react'
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
  receipt_url_2?: string | null
  receipt_name?: string | null
  receipt_name_2?: string | null
  card_id?: string | null
  split_participants: { participant_name: string; participant_email: string | null; amount_owed: number; is_paid: boolean }[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (splitId?: string) => void
  defaultTitle?: string
  defaultAmount?: string | number
  tripId?: string | null
  contactId?: string | null
  defaultParticipants?: { name: string; email: string }[]
  defaultDate?: string
  editingSplit?: EditingSplit | null
}

const emptyParticipant = (): Participant => ({ name: '', email: '', amount: '' })

export default function SplitModal({ open, onClose, onSaved, defaultTitle, defaultAmount, defaultDate, tripId, contactId, defaultParticipants, editingSplit }: Props) {
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
  const [receiptUrl2, setReceiptUrl2] = useState('')
  const [receiptName2, setReceiptName2] = useState('')
  const [uploadingFile2, setUploadingFile2] = useState(false)
  const [receiptCustomName, setReceiptCustomName] = useState('')
  const [receiptCustomName2, setReceiptCustomName2] = useState('')
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
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
    date: string; selectedTripId: string | null; selectedCardId: string | null; receiptUrl: string; receiptUrl2: string; receiptCustomName: string; receiptCustomName2: string; participants: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      fetch('/api/friends').then(r => r.json()).then(d => setFriends(Array.isArray(d) ? d : [])).catch(() => {})
      fetch('/api/trips').then(r => r.json()).then(d => setTrips(Array.isArray(d) ? d : [])).catch(() => {})
      fetch('/api/cards').then(r => r.json()).then(d => setCards(Array.isArray(d) ? d : [])).catch(() => {})
      createClient().auth.getUser().then(({ data: { user } }) => {
        if (user?.email) {
          setMyEmail(user.email.toLowerCase())
          setMyName(
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email.split('@')[0]
          )
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
        setReceiptName(editingSplit.receipt_url
          ? decodeURIComponent(editingSplit.receipt_url.split('/').pop() ?? '').replace(/^\d+-/, '')
          : '')
        setReceiptUrl2(editingSplit.receipt_url_2 ?? '')
        setReceiptName2(editingSplit.receipt_url_2
          ? decodeURIComponent(editingSplit.receipt_url_2.split('/').pop() ?? '').replace(/^\d+-/, '')
          : '')
        setReceiptCustomName(editingSplit.receipt_name ?? '')
        setReceiptCustomName2(editingSplit.receipt_name_2 ?? '')
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
          receiptUrl2: editingSplit.receipt_url_2 ?? '',
          receiptCustomName: editingSplit.receipt_name ?? '',
          receiptCustomName2: editingSplit.receipt_name_2 ?? '',
          participants: JSON.stringify(editParticipants),
        }
      } else {
        // Create mode
        const initTitle = defaultTitle ?? ''
        const initAmount = defaultAmount != null ? String(defaultAmount) : ''
        const initCategory = 'Food & Dining'
        const initDate = defaultDate ?? format(new Date(), 'yyyy-MM-dd')
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
        setReceiptUrl2('')
        setReceiptName2('')
        setReceiptCustomName('')
        setReceiptCustomName2('')
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
          receiptUrl2: '',
          receiptCustomName: '',
          receiptCustomName2: '',
          participants: JSON.stringify(initParticipants),
        }
      }
    }
  }, [open, editingSplit, defaultTitle, defaultAmount, defaultDate, defaultParticipants, tripId])

  function reset() {
    setTitle(''); setTotalAmount(''); setCategory('Food & Dining')
    setDescription(''); setDate(format(new Date(), 'yyyy-MM-dd'))
    setParticipants([emptyParticipant(), emptyParticipant()])
    setSelectedTripId(null); setSelectedCardId(null)
    setReceiptUrl(''); setReceiptName(''); setReceiptCustomName('')
    setReceiptUrl2(''); setReceiptName2(''); setReceiptCustomName2('')
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
      if (title.trim()) fd.append('title', title.trim())
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

  function insertBold() {
    const el = descriptionRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const selected = value.slice(s, e) || 'bold text'
    const before = value.slice(0, s)
    const after = value.slice(e)
    const next = `${before}**${selected}**${after}`
    setDescription(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + 2, s + 2 + selected.length)
    })
  }

  function insertBullet() {
    const el = descriptionRef.current
    if (!el) return
    const { selectionStart: s, value } = el
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const before = value.slice(0, lineStart)
    const after = value.slice(lineStart)
    const next = `${before}- ${after}`
    setDescription(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + 2, s + 2)
    })
  }

  async function handleFileUpload2(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile2(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (title.trim()) fd.append('title', title.trim())
      const res = await fetch('/api/splits/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setReceiptUrl2(data.url)
      setReceiptName2(data.name)
      toast.success('Second file attached!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFile2(false)
      e.target.value = ''
    }
  }

  function addParticipant() { setParticipants(p => [...p, emptyParticipant()]) }
  function removeParticipant(i: number) { setParticipants(p => p.filter((_, idx) => idx !== i)) }

  function addFriendAsParticipant(friend: Friend) {
    const emptyIdx = participants.findIndex(p => !p.name && !p.email)
    const alreadyAdded = participants.some(p =>
      (friend.email && p.email === friend.email) ||
      p.name.toLowerCase() === friend.name.toLowerCase()
    )
    if (alreadyAdded) { toast.error(`${friend.name} is already added`); return }
    const newRow: Participant = { name: friend.name, email: friend.email ?? '', amount: '' }
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
        receipt_url_2: receiptUrl2 || null,
        receipt_name: receiptCustomName.trim() || null,
        receipt_name_2: receiptCustomName2.trim() || null,
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

      // Silently add new participants as friends (fire-and-forget)
      if (!editingSplit) {
        const knownEmails = new Set(friends.map(f => f.email?.toLowerCase()).filter(Boolean))
        const knownNames = new Set(friends.map(f => f.name.toLowerCase()))
        const newPeople = validParticipants.filter(p => {
          if (p.email && p.email.toLowerCase() === myEmail.toLowerCase()) return false
          if (p.email && knownEmails.has(p.email.toLowerCase())) return false
          if (!p.email && knownNames.has(p.name.toLowerCase())) return false
          return true
        })
        newPeople.forEach(p => {
          fetch('/api/friends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: p.name, email: p.email || undefined }),
          }).catch(() => {})
        })
      }

      reset()
      onSaved(editingSplit ? undefined : data.id)
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
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleCloseAttempt() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {saving && (
          <div className="flex items-center gap-2.5 rounded-lg bg-primary/8 border border-primary/20 px-3.5 py-2.5 text-sm text-primary mb-1">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="font-medium">Saving your changes…</span>
          </div>
        )}
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
              <div className="rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 overflow-hidden">
                <div className="flex items-center gap-0.5 border-b border-input px-2 py-1 bg-muted/40">
                  <button type="button" onClick={insertBold} className="rounded px-1.5 py-0.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">B</button>
                  <button type="button" onClick={insertBullet} className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Textarea
                  ref={descriptionRef}
                  placeholder="Optional note — supports **bold** and - bullet lists"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="min-h-[60px] resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:border-0 bg-transparent"
                />
              </div>
            </div>

            {/* Attachments (up to 2) */}
            <div className="col-span-2 space-y-2">
              <Label>Attachments <span className="text-muted-foreground font-normal text-xs">(up to 2 PDFs or images · sent with reminder emails)</span></Label>
              {/* Slot 1 */}
              {receiptUrl ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-xs text-primary hover:underline">
                      {receiptCustomName.trim() || receiptName || 'Attachment 1'}
                    </a>
                    <button type="button" onClick={() => { setReceiptUrl(''); setReceiptName(''); setReceiptCustomName('') }} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    placeholder="Name this attachment (optional, e.g. Receipt)"
                    value={receiptCustomName}
                    onChange={e => setReceiptCustomName(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              ) : (
                <label className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors ${uploadingFile ? 'pointer-events-none opacity-60' : ''}`}>
                  {uploadingFile
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</>
                    : <><Upload className="w-3.5 h-3.5" />Attach PDF or image</>}
                  <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                </label>
              )}
              {/* Slot 2 — only show once slot 1 is filled */}
              {receiptUrl && (
                receiptUrl2 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <a href={receiptUrl2} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-xs text-primary hover:underline">
                        {receiptCustomName2.trim() || receiptName2 || 'Attachment 2'}
                      </a>
                      <button type="button" onClick={() => { setReceiptUrl2(''); setReceiptName2(''); setReceiptCustomName2('') }} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Name this attachment (optional, e.g. Invoice)"
                      value={receiptCustomName2}
                      onChange={e => setReceiptCustomName2(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors ${uploadingFile2 ? 'pointer-events-none opacity-60' : ''}`}>
                    {uploadingFile2
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</>
                      : <><Upload className="w-3.5 h-3.5" />Attach second PDF or image</>}
                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload2} disabled={uploadingFile2} />
                  </label>
                )
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
              isSelected={f => participants.some(p => (f.email && p.email === f.email) || p.name.toLowerCase() === f.name.toLowerCase())}
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

          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose() }} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{editingSplit ? 'Saving…' : 'Creating…'}</>
                : editingSplit ? 'Save changes' : 'Create split'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
