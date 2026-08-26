'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  UserPlus, Pencil, Trash2, Loader2, Search, Mail, StickyNote,
  ArrowLeftRight, SplitSquareVertical, X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import SplitModal from '@/components/splits/SplitModal'
import type { Contact, Transaction, SplitParticipantSummary } from '@/types'

interface ContactSplit {
  id: string
  title: string
  total_amount: number
  date: string
  category: string
  contact_id: string | null
  split_participants?: SplitParticipantSummary[]
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name: string) {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
    'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-pink-500',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

interface ContactForm { name: string; email: string; notes: string }
const emptyForm = (): ContactForm => ({ name: '', email: '', notes: '' })

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create / edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [form, setForm] = useState<ContactForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // Contact detail sheet
  const [selected, setSelected] = useState<Contact | null>(null)
  const [contactTxs, setContactTxs] = useState<Transaction[]>([])
  const [contactSplits, setContactSplits] = useState<ContactSplit[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)

  // Split from contact
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitContact, setSplitContact] = useState<Contact | null>(null)

  function loadContacts() {
    setLoading(true)
    fetch('/api/contacts')
      .then(r => r.json())
      .then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load contacts'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadContacts() }, [])

  function openCreate() {
    setEditingContact(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingContact(c)
    setForm({ name: c.name, email: c.email ?? '', notes: c.notes ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const url = editingContact ? `/api/contacts?id=${editingContact.id}` : '/api/contacts'
      const method = editingContact ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success(editingContact ? 'Contact updated' : 'Contact added')
      setModalOpen(false)
      loadContacts()
      if (selected && editingContact?.id === selected.id) {
        const updated = await res.json()
        setSelected(updated)
      }
    } catch {
      toast.error('Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${c.name}"? Their transactions will remain but the contact tag will be removed.`)) return
    try {
      await fetch(`/api/contacts?id=${c.id}`, { method: 'DELETE' })
      toast.success('Contact deleted')
      if (selected?.id === c.id) setSelected(null)
      loadContacts()
    } catch {
      toast.error('Failed to delete contact')
    }
  }

  function openDetail(c: Contact) {
    setSelected(c)
    setContactTxs([])
    setContactSplits([])
    setLoadingTxs(true)
    Promise.all([
      fetch(`/api/transactions?contact_id=${c.id}`).then(r => r.json()),
      fetch(`/api/splits?contact_id=${c.id}`).then(r => r.json()),
    ])
      .then(([txs, splits]) => {
        setContactTxs(Array.isArray(txs) ? txs : [])
        setContactSplits(Array.isArray(splits) ? splits : [])
      })
      .catch(() => {})
      .finally(() => setLoadingTxs(false))
  }

  function openSplit(c: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    setSplitContact(c)
    setSplitOpen(true)
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalSpent = contactTxs
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)

  // Sum of what contacts owe across all splits (unpaid participants)
  const totalSplitOwed = contactSplits.reduce((sum, split) => {
    const unpaid = (split.split_participants ?? [])
      .filter(p => !p.is_paid)
      .reduce((s, p) => s + p.amount_owed, 0)
    return sum + unpaid
  }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm">Tag transactions with people you transact with</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <UserPlus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Contact grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="font-medium">{search ? 'No contacts found' : 'No contacts yet'}</p>
          {!search && (
            <p className="text-sm text-muted-foreground max-w-xs">
              Add contacts to tag them on transactions and quickly create splits.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => openDetail(c)}
              className="group relative flex items-start gap-4 p-4 rounded-xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
            >
              <Avatar className="w-11 h-11 shrink-0">
                <AvatarFallback className={`text-white text-sm font-semibold ${avatarColor(c.name)}`}>
                  {initials(c.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{c.name}</p>
                {c.email && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.email}</p>
                )}
                {c.notes && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5 italic">{c.notes}</p>
                )}
              </div>
              {/* Action buttons — visible on hover */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => openSplit(c, e)}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Create split"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => openEdit(c, e)}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => handleDelete(c, e)}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact detail sheet */}
      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          {selected && (
            <>
              <SheetHeader className="p-6 pb-4 border-b">
                <div className="flex items-start gap-4">
                  <Avatar className="w-14 h-14 shrink-0">
                    <AvatarFallback className={`text-white text-lg font-bold ${avatarColor(selected.name)}`}>
                      {initials(selected.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl">{selected.name}</SheetTitle>
                    {selected.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Mail className="w-3.5 h-3.5" />{selected.email}
                      </p>
                    )}
                    {selected.notes && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                        <StickyNote className="w-3.5 h-3.5" />{selected.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={e => openEdit(selected, e)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={e => openSplit(selected, e)}>
                    <SplitSquareVertical className="w-3.5 h-3.5 mr-1.5" />Create Split
                  </Button>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                {/* Stats */}
                {!loadingTxs && (contactTxs.length > 0 || contactSplits.length > 0) && (
                  <div className="px-6 py-4 border-b flex items-center gap-6 flex-wrap">
                    {contactTxs.length > 0 && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">Transactions</p>
                          <p className="font-semibold">{contactTxs.length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total spent</p>
                          <p className="font-semibold text-red-600">{formatCurrency(totalSpent)}</p>
                        </div>
                      </>
                    )}
                    {contactSplits.length > 0 && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">Splits</p>
                          <p className="font-semibold">{contactSplits.length}</p>
                        </div>
                        {totalSplitOwed > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Owes you</p>
                            <p className="font-semibold text-amber-600">{formatCurrency(totalSplitOwed)}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="px-6 py-4">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4" />
                    Tagged transactions
                  </p>

                  {loadingTxs ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                    </div>
                  ) : contactTxs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No transactions tagged with {selected.name} yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {contactTxs.map(t => (
                        <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.description ?? t.category}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy')} · {t.category}
                            </p>
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Splits section */}
                  {!loadingTxs && contactSplits.length > 0 && (
                    <div className="mt-5">
                      <p className="text-sm font-medium mb-3 flex items-center gap-2">
                        <SplitSquareVertical className="w-4 h-4" />
                        Splits
                      </p>
                      <div className="space-y-2">
                        {contactSplits.map(split => {
                          const participants = split.split_participants ?? []
                          const owed = participants.filter(p => !p.is_paid).reduce((s, p) => s + p.amount_owed, 0)
                          const settled = owed === 0
                          return (
                            <div key={split.id} className="p-3 rounded-lg border bg-card space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate">{split.title}</p>
                                <span className={`text-sm font-semibold shrink-0 ${settled ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {settled ? 'Settled' : `Owes ${formatCurrency(owed)}`}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(split.date + 'T00:00:00'), 'dd MMM yyyy')} · {split.category} · Total {formatCurrency(split.total_amount)}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Email <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Used for splits and future features</p>
            </div>
            <div className="space-y-1">
              <Label>Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. roommate, colleague…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingContact ? 'Save' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split modal pre-filled from contact */}
      {splitContact && (
        <SplitModal
          open={splitOpen}
          onClose={() => { setSplitOpen(false); setSplitContact(null) }}
          onSaved={() => { setSplitOpen(false); setSplitContact(null) }}
          defaultParticipants={[{ name: splitContact.name, email: splitContact.email ?? '' }]}
        />
      )}
    </div>
  )
}
