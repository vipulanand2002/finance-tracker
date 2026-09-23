'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, EyeOff, Loader2, Plus, Trash2, Upload, Image as ImageIcon, Users } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/constants'
import { FriendPicker } from '@/components/friends/FriendPicker'
import type { Trip, Friend } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  trip?: Trip | null
}

const empty = {
  name: '',
  destination: '',
  description: '',
  start_date: '',
  end_date: '',
  budget_total: '',
  personal_budget: '',
  budget_visible_to_members: true,
}

export default function TripModal({ open, onClose, onSaved, trip }: Props) {
  const [form, setForm] = useState(empty)
  const [budgets, setBudgets] = useState<{ category: string; amount: string }[]>([])
  const [members, setMembers] = useState<{ email: string; name: string }[]>([])
  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')
  const [friends, setFriends] = useState<Friend[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/friends').then(r => r.json()).then(d => setFriends(Array.isArray(d) ? d : [])).catch(() => {})
    if (trip) {
      setForm({
        name: trip.name,
        destination: trip.destination ?? '',
        description: trip.description ?? '',
        start_date: trip.start_date ?? '',
        end_date: trip.end_date ?? '',
        budget_total: trip.budget_total ? String(trip.budget_total) : '',
        personal_budget: '',
        budget_visible_to_members: trip.budget_visible_to_members !== false,
      })
      setBudgets(
        (trip.trip_budgets ?? []).map(b => ({ category: b.category, amount: String(b.amount) }))
      )
      // Accepted members + pending invitations (so added-but-not-yet-accepted people still show up)
      const accepted = (trip.trip_members ?? []).map(m => ({ email: m.email, name: m.name ?? '' }))
      const acceptedEmails = new Set(accepted.map(m => m.email.toLowerCase()))
      const pending = (trip.trip_invitations ?? [])
        .filter(i => i.status === 'pending' && !acceptedEmails.has(i.invitee_email.toLowerCase()))
        .map(i => ({ email: i.invitee_email, name: i.invitee_name ?? '' }))
      setMembers([...accepted, ...pending])
      setImagePreview(trip.image_url ?? '')
      // Pre-fill existing personal budget
      fetch(`/api/trip-personal-budget?trip_id=${trip.id}&mine=true`)
        .then(r => r.json())
        .then((data: { amount: number } | null) => {
          if (data && 'amount' in data) setForm(f => ({ ...f, personal_budget: String(data.amount) }))
        })
        .catch(() => {})
    } else {
      setForm(empty)
      setBudgets([])
      setMembers([])
      setImagePreview('')
    }
    setMemberEmail('')
    setMemberName('')
    setImageFile(null)
  }, [trip, open])

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function addBudgetRow() {
    setBudgets(b => [...b, { category: '', amount: '' }])
  }

  function updateBudget(i: number, field: 'category' | 'amount', val: string) {
    setBudgets(b => b.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }

  function removeBudget(i: number) {
    setBudgets(b => b.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Trip name is required'); return }

    setSaving(true)
    try {
      let imageUrl = trip?.image_url ?? null

      // Upload image if a new one was selected
      if (imageFile) {
        const fd = new FormData()
        fd.append('image', imageFile)
        const uploadRes = await fetch('/api/trips/upload', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Image upload failed')
        imageUrl = uploadData.url
      }

      const validBudgets = budgets
        .filter(b => b.category && parseFloat(b.amount) > 0)
        .map(b => ({ category: b.category, amount: parseFloat(b.amount) }))

      const validMembers = members.filter(m => m.email.trim())

      const payload = {
        name: form.name.trim(),
        destination: form.destination.trim() || null,
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        image_url: imageUrl,
        budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
        budget_visible_to_members: form.budget_total ? form.budget_visible_to_members : null,
        trip_budgets: validBudgets,
        trip_members: validMembers.map(m => ({ email: m.email.trim().toLowerCase(), name: m.name.trim() || null })),
      }

      const url = trip ? `/api/trips?id=${trip.id}` : '/api/trips'
      const method = trip ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')

      // Save personal budget if provided
      const personalAmount = parseFloat(form.personal_budget)
      if (!isNaN(personalAmount) && personalAmount > 0) {
        const tripId = trip ? trip.id : (await res.json()).id
        await fetch('/api/trip-personal-budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_id: tripId, amount: personalAmount }),
        }).catch(() => {})
      }

      toast.success(trip ? 'Trip updated!' : 'Trip created!')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save trip')
    } finally {
      setSaving(false)
    }
  }

  const usedCategories = new Set(budgets.map(b => b.category))
  const availableCategories = EXPENSE_CATEGORIES.filter(c => !usedCategories.has(c))

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trip ? 'Edit Trip' : 'Create Trip'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Cover image */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative w-full h-36 rounded-xl overflow-hidden cursor-pointer group bg-muted border-2 border-dashed hover:border-primary/60 transition-colors"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <ImageIcon className="w-8 h-8" />
                <span className="text-xs">Click to add cover photo</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>

          {/* Name + Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Trip Name *</Label>
              <Input
                placeholder="e.g. Goa Trip 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Destination</Label>
              <Input
                placeholder="e.g. Goa, India"
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input
              placeholder="Any details about this trip"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Budget fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                Trip Budget <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 50000"
                value={form.budget_total}
                onChange={e => setForm(f => ({ ...f, budget_total: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>
                My Personal Budget <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 15000"
                value={form.personal_budget}
                onChange={e => setForm(f => ({ ...f, personal_budget: e.target.value }))}
              />
            </div>
          </div>

          {/* Trip budget visibility — only shown when a trip budget is set */}
          {form.budget_total && (
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, budget_visible_to_members: !f.budget_visible_to_members }))}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left ${
                form.budget_visible_to_members
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
              }`}
            >
              {form.budget_visible_to_members
                ? <Eye className="w-4 h-4 text-emerald-600 shrink-0" />
                : <EyeOff className="w-4 h-4 text-amber-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-xs ${form.budget_visible_to_members ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {form.budget_visible_to_members ? 'Budget visible to members' : 'Budget hidden from members'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.budget_visible_to_members
                    ? 'Members can see the trip total budget and progress'
                    : 'Only you (the owner) can see the trip budget'}
                </p>
              </div>
            </button>
          )}

          {/* Category budgets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Category Budgets <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={addBudgetRow}
                disabled={availableCategories.length === 0}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>

            {budgets.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select
                  value={row.category}
                  onValueChange={v => v && updateBudget(i, 'category', v)}
                >
                  <SelectTrigger className="flex-1 h-8 text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES
                      .filter(c => c === row.category || !usedCategories.has(c))
                      .map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  placeholder="Budget"
                  className="w-28 h-8 text-sm"
                  value={row.amount}
                  onChange={e => updateBudget(i, 'amount', e.target.value)}
                />
                <button type="button" onClick={() => removeBudget(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Trip Members */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Members
              <span className="text-muted-foreground font-normal text-xs">(for quick split)</span>
            </Label>

            {/* Quick-add from friends */}
            <FriendPicker
              friends={friends}
              isSelected={f => members.some(m => (f.email && m.email.toLowerCase() === f.email.toLowerCase()) || m.name.toLowerCase() === f.name.toLowerCase())}
              onSelect={f => setMembers(prev => [...prev, { email: f.email ?? '', name: f.name }])}
              placeholder="Search friends to add as member…"
            />

            {/* Manual add */}
            <div className="flex gap-2">
              <Input
                placeholder="Email"
                type="email"
                value={memberEmail}
                onChange={e => setMemberEmail(e.target.value)}
                className="flex-1 h-8 text-sm"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!memberEmail.trim()) return
                    const email = memberEmail.trim().toLowerCase()
                    if (members.some(m => m.email.toLowerCase() === email)) return
                    setMembers(prev => [...prev, { email, name: memberName.trim() }])
                    setMemberEmail('')
                    setMemberName('')
                  }
                }}
              />
              <Input
                placeholder="Name (optional)"
                value={memberName}
                onChange={e => setMemberName(e.target.value)}
                className="w-32 h-8 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5"
                onClick={() => {
                  if (!memberEmail.trim()) return
                  const email = memberEmail.trim().toLowerCase()
                  if (members.some(m => m.email.toLowerCase() === email)) return
                  setMembers(prev => [...prev, { email, name: memberName.trim() }])
                  setMemberEmail('')
                  setMemberName('')
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Members list */}
            {members.length > 0 && (
              <div className="space-y-1">
                {members.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-2.5 py-1.5">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[10px] shrink-0">
                      {(m.name || m.email).charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-xs">
                      {m.name ? <><span className="font-medium">{m.name}</span> <span className="text-muted-foreground">{m.email}</span></> : m.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMembers(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{trip ? 'Saving…' : 'Creating…'}</> : trip ? 'Save Changes' : 'Create Trip'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
