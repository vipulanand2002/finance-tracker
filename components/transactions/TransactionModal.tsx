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
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { EyeOff, Loader2, Settings2, Upload, X, SplitSquareVertical, CreditCard, MapPin, Users } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRIP_EXPENSE_CATEGORIES } from '@/lib/constants'
import { ManageCategories } from '@/components/categories/ManageCategories'
import SplitModal from '@/components/splits/SplitModal'
import type { Transaction, Trip, Contact } from '@/types'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  transaction?: Transaction | null
  defaultTripId?: string | null
  defaultCardId?: string | null
  // When true (and creating a new expense), the split editor opens immediately —
  // used when launching this modal from the Splits area.
  defaultSplitOpen?: boolean
}

const DATE_KEY = 'lastTransactionDate'

function getDefaultDate() {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(DATE_KEY)
    if (saved) return saved
  }
  return format(new Date(), 'yyyy-MM-dd')
}

function buildEmptyForm(tripId?: string | null, cardId?: string | null) {
  return {
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '',
    description: '',
    date: getDefaultDate(),
    is_recurring: false,
    is_discrete: false,
    receipt_url: '',
    trip_id: tripId ?? null,
    contact_ids: [] as string[],
    card_id: cardId ?? null,
  }
}

interface CardStatement { id: string; cycle_start: string; cycle_end: string }
interface CardInfo { id: string; card_name: string; last_four: string | null }

export default function TransactionModal({ open, onClose, onSaved, transaction, defaultTripId, defaultCardId, defaultSplitOpen }: Props) {
  const [form, setForm] = useState(() => buildEmptyForm(defaultTripId, defaultCardId))
  const [saving, setSaving] = useState(false)
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [splitOpen, setSplitOpen] = useState(false)
  const [linkedSplitId, setLinkedSplitId] = useState<string | null>(null)
  const [cards, setCards] = useState<CardInfo[]>([])
  const [cardStatements, setCardStatements] = useState<CardStatement[]>([])
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null)
  const [selectedCycleId, setSelectedCycleId] = useState<string>('none')
  const [expenseCategories, setExpenseCategories] = useState<string[]>([...EXPENSE_CATEGORIES])
  const [incomeCategories, setIncomeCategories] = useState<string[]>([...INCOME_CATEGORIES])
  const [manageCatOpen, setManageCatOpen] = useState(false)
  // Incremented to remount the "add contact" Select after each pick, resetting to placeholder
  const [addContactKey, setAddContactKey] = useState(0)
  // Whether trips / contacts / cards have all resolved — gates the options block so
  // the toggle rows appear together instead of popping in one by one.
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  // Progressive-disclosure toggles for the optional sections
  const [tripEnabled, setTripEnabled] = useState(false)
  const [cardEnabled, setCardEnabled] = useState(false)
  const [friendsEnabled, setFriendsEnabled] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const originalFormRef = useRef<ReturnType<typeof buildEmptyForm> | null>(null)

  const loadCategories = () => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) return
        setExpenseCategories(
          data.filter((c: { list_type: string }) => c.list_type === 'expense').map((c: { name: string }) => c.name)
        )
        setIncomeCategories(
          data.filter((c: { list_type: string }) => c.list_type === 'income').map((c: { name: string }) => c.name)
        )
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!open) return
    setOptionsLoaded(false)
    // Fetch the option sources together so the toggle rows render in one pass
    Promise.all([
      fetch('/api/trips').then(r => r.json()).catch(() => []),
      fetch('/api/contacts').then(r => r.json()).catch(() => []),
      fetch('/api/cards').then(r => r.json()).catch(() => []),
    ]).then(([t, c, cd]) => {
      setTrips(Array.isArray(t) ? t : [])
      setContacts(Array.isArray(c) ? c : [])
      setCards(Array.isArray(cd) ? cd : [])
      setOptionsLoaded(true)
    })
    loadCategories()
    setSelectedCycleId('none')
    // Fetch current user for trip-split pre-population
    createBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'You'
      setCurrentUser({ name, email: user.email ?? '' })
    }).catch(() => {})
  }, [open])

  // Load billing cycles whenever the selected card changes
  useEffect(() => {
    const cardId = form.card_id
    if (!cardId) { setCardStatements([]); return }
    fetch(`/api/card-statements?card_id=${cardId}`)
      .then(r => r.json())
      .then(d => setCardStatements(Array.isArray(d) ? d.slice(0, 6) : []))
      .catch(() => setCardStatements([]))
  }, [form.card_id])

  useEffect(() => {
    if (transaction) {
      const populated = {
        amount: String(transaction.amount),
        type: transaction.type,
        category: transaction.category,
        description: transaction.description ?? '',
        date: transaction.date,
        is_recurring: transaction.is_recurring,
        is_discrete: transaction.is_discrete ?? false,
        receipt_url: transaction.receipt_url ?? '',
        trip_id: transaction.trip_id ?? null,
        // Prefer contact_ids array; fall back to single contact_id for old records
        contact_ids: transaction.contact_ids?.length
          ? transaction.contact_ids
          : transaction.contact_id ? [transaction.contact_id] : [],
        card_id: transaction.card_id ?? null,
      }
      setForm(populated)
      originalFormRef.current = populated
      setTripEnabled(!!populated.trip_id)
      setCardEnabled(!!populated.card_id)
      setFriendsEnabled(populated.contact_ids.length > 0)
    } else {
      const empty = buildEmptyForm(defaultTripId, defaultCardId)
      setForm(empty)
      originalFormRef.current = empty
      setTripEnabled(!!defaultTripId)
      setCardEnabled(!!defaultCardId)
      setFriendsEnabled(false)
    }
    setAddContactKey(k => k + 1)
    setLinkedSplitId(transaction?.split_id ?? null)
    // Open the split editor straight away when launched from the Splits area
    setSplitOpen(open && !transaction && !!defaultSplitOpen)
  }, [transaction, open, defaultTripId, defaultCardId, defaultSplitOpen])

  const categories = form.type === 'income'
    ? incomeCategories
    : form.trip_id
      ? (TRIP_EXPENSE_CATEGORIES as unknown as string[])
      : expenseCategories

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleTrip(on: boolean) {
    setTripEnabled(on)
    if (on) {
      // Trips are expense-only; force type and reset a non-trip category
      set('type', 'expense')
      const tripCats = TRIP_EXPENSE_CATEGORIES as unknown as string[]
      if (!tripCats.includes(form.category)) set('category', '')
    } else {
      setForm(prev => ({ ...prev, trip_id: null, is_discrete: false }))
    }
  }

  function toggleCard(on: boolean) {
    setCardEnabled(on)
    if (!on) {
      set('card_id', null)
      setSelectedCycleId('none')
    }
  }

  function toggleFriends(on: boolean) {
    setFriendsEnabled(on)
    if (!on) set('contact_ids', [])
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
      if (data.category && categories.includes(data.category)) set('category', data.category)
      if (data.date) set('date', data.date)
      if (data.receiptUrl) set('receipt_url', data.receiptUrl)
      toast.success('Receipt scanned successfully!')
    } catch {
      toast.error('Failed to scan receipt')
    } finally {
      setScanningReceipt(false)
    }
  }

  async function doSubmit() {
    if (!form.amount || !form.category || !form.date) {
      toast.warning('Please fill in amount, category, and date to save')
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
        // Primary contact (FK for join in transaction list)
        contact_id: form.contact_ids[0] ?? null,
        // Full contact list (requires contact_ids uuid[] column in DB)
        contact_ids: form.contact_ids,
        card_id: form.card_id || null,
        split_id: linkedSplitId || null,
      }
      const url = transaction ? `/api/transactions?id=${transaction.id}` : '/api/transactions'
      const method = transaction ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? 'Failed to save')
      }
      localStorage.setItem(DATE_KEY, form.date)
      toast.success(transaction ? 'Transaction updated' : 'Transaction added')
      // Notify trips page to refresh totals when a trip-linked transaction changes
      if (form.trip_id) {
        window.dispatchEvent(new CustomEvent('tripTransactionsChanged'))
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save transaction')
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
    onClose()
  }

  const availableContacts = contacts.filter(c => !form.contact_ids.includes(c.id))

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) handleCloseAttempt() }}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
          {saving && (
            <div className="flex items-center gap-2.5 rounded-lg bg-primary/8 border border-primary/20 px-3.5 py-2.5 text-sm text-primary mb-1">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="font-medium">Saving your changes…</span>
            </div>
          )}
          <DialogHeader>
            <DialogTitle>{transaction ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {!tripEnabled && (
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

            {/* Category with Manage button */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Category *</Label>
                {!tripEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground gap-1"
                    onClick={() => setManageCatOpen(true)}
                  >
                    <Settings2 className="w-3 h-3" />
                    Manage
                  </Button>
                )}
              </div>
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

            {/* ── Options: progressive disclosure ── */}
            {!optionsLoaded ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                {/* Split (expense only) */}
                {form.type === 'expense' && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <SplitSquareVertical className="w-4 h-4 text-muted-foreground" />
                      Split this expense
                    </span>
                    {linkedSplitId ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-emerald-600 font-medium">Linked</span>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSplitOpen(true)}>
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setSplitOpen(true)}>
                        Add split
                      </Button>
                    )}
                  </div>
                )}

                {/* Trip toggle (expense only — trips can't hold income) */}
                {trips.length > 0 && form.type === 'expense' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        Spent on a trip?
                      </span>
                      <Switch checked={tripEnabled} onCheckedChange={toggleTrip} />
                    </div>
                    {tripEnabled && (
                      <>
                        <Select
                          value={form.trip_id ?? ''}
                          onValueChange={v => {
                            if (!v) return
                            set('trip_id', v)
                            const tripCats = TRIP_EXPENSE_CATEGORIES as unknown as string[]
                            if (!tripCats.includes(form.category)) set('category', '')
                          }}
                        >
                          <SelectTrigger>
                            <span className="truncate text-sm">
                              {form.trip_id
                                ? (trips.find(t => t.id === form.trip_id)?.name ?? '…')
                                : <span className="text-muted-foreground">Select a trip</span>}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {trips.filter(t => !t.is_closed || t.id === form.trip_id).map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}{t.is_closed ? ' (closed)' : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Private expense — only meaningful within a trip */}
                        {form.trip_id && (
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
                                Counts toward your personal budget only — hidden from other trip members.
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Card toggle */}
                {cards.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        Paid with a card?
                      </span>
                      <Switch checked={cardEnabled} onCheckedChange={toggleCard} />
                    </div>
                    {cardEnabled && (
                      <>
                        <Select
                          value={form.card_id ?? ''}
                          onValueChange={v => {
                            if (!v) return
                            set('card_id', v)
                            setSelectedCycleId('none')
                          }}
                        >
                          <SelectTrigger>
                            <span className="truncate text-sm">
                              {form.card_id
                                ? (() => { const c = cards.find(c => c.id === form.card_id); return c ? `${c.card_name}${c.last_four ? ` ••${c.last_four}` : ''}` : '…' })()
                                : <span className="text-muted-foreground">Select a card</span>}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {cards.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.card_name}{c.last_four ? ` ••${c.last_four}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Billing cycle picker — only when the card has cycles */}
                        {cardStatements.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Billing cycle (optional)</Label>
                            <Select
                              value={selectedCycleId}
                              onValueChange={v => {
                                if (!v) return
                                setSelectedCycleId(v)
                                if (v !== 'none') {
                                  const stmt = cardStatements.find(s => s.id === v)
                                  if (stmt) set('date', stmt.cycle_end)
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Add to a billing cycle" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No cycle</SelectItem>
                                {cardStatements.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {format(new Date(s.cycle_start + 'T00:00:00'), 'dd MMM')}
                                    {' – '}
                                    {format(new Date(s.cycle_end + 'T00:00:00'), 'dd MMM yyyy')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedCycleId !== 'none' && (
                              <p className="text-xs text-muted-foreground">Date set to cycle end — adjust if needed</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Friends toggle */}
                {contacts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        Tag friends?
                      </span>
                      <Switch checked={friendsEnabled} onCheckedChange={toggleFriends} />
                    </div>
                    {friendsEnabled && (
                      <div className="space-y-1.5">
                        {form.contact_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {form.contact_ids.map(id => {
                              const c = contacts.find(x => x.id === id)
                              if (!c) return null
                              return (
                                <Badge key={id} variant="secondary" className="gap-1 pr-1.5 max-w-[200px]">
                                  <span className="truncate">{c.name}</span>
                                  <button
                                    type="button"
                                    className="shrink-0 hover:text-destructive transition-colors"
                                    onClick={() => set('contact_ids', form.contact_ids.filter(x => x !== id))}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              )
                            })}
                          </div>
                        )}
                        {availableContacts.length > 0 && (
                          <Select
                            key={addContactKey}
                            onValueChange={(v: string | null) => {
                              if (!v || form.contact_ids.includes(v)) return
                              set('contact_ids', [...form.contact_ids, v])
                              setAddContactKey(k => k + 1)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={form.contact_ids.length === 0 ? 'Tag a friend…' : 'Add another friend…'} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableContacts.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}{c.email ? ` (${c.email})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : transaction ? 'Save changes' : 'Add transaction'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ManageCategories
        open={manageCatOpen}
        onClose={() => setManageCatOpen(false)}
        onChanged={loadCategories}
      />

      {(() => {
        const selectedContacts = form.contact_ids
          .map(id => contacts.find(c => c.id === id))
          .filter((c): c is Contact => !!c)

        // When a trip is selected, pre-fill with current user + all trip members
        let defaultParticipants: { name: string; email: string }[] | undefined
        if (form.trip_id && currentUser) {
          const trip = trips.find(t => t.id === form.trip_id)
          const userEmailLower = currentUser.email.toLowerCase()
          const participants: { name: string; email: string }[] = [
            { name: currentUser.name, email: currentUser.email },
          ]
          // All non-declined invitations are trip members
          const seenEmails = new Set(participants.filter(p => p.email).map(p => p.email.toLowerCase()))
          for (const inv of (trip?.trip_invitations ?? [])) {
            if (inv.status === 'declined') continue
            const isPlaceholder = inv.invitee_email.startsWith('_nomail_')
            const e = isPlaceholder ? '' : inv.invitee_email
            if (e && e.toLowerCase() === userEmailLower) continue
            if (e && seenEmails.has(e.toLowerCase())) continue
            const name = inv.invitee_name || (e ? e.split('@')[0] : '')
            if (!name) continue
            participants.push({ name, email: e })
            if (e) seenEmails.add(e.toLowerCase())
          }
          // Legacy trip_members not yet in invitations
          for (const m of (trip?.trip_members ?? [])) {
            const email = m.email ?? ''
            if (!email || email.toLowerCase() === userEmailLower || seenEmails.has(email.toLowerCase())) continue
            participants.push({ name: m.name || email.split('@')[0], email })
            seenEmails.add(email.toLowerCase())
          }
          defaultParticipants = participants
        } else if (selectedContacts.length > 0) {
          defaultParticipants = selectedContacts.map(c => ({ name: c.name, email: c.email ?? '' }))
        }

        return (
          <SplitModal
            open={splitOpen}
            onClose={() => {
              setSplitOpen(false)
              // Launched straight into the split editor (Splits page) and nothing
              // was linked — close the whole modal instead of leaving the user on
              // an empty transaction form.
              if (defaultSplitOpen && !transaction && !linkedSplitId) onClose()
            }}
            transactionId={transaction?.id ?? null}
            onSaved={async (splitId) => {
              setSplitOpen(false)
              if (!splitId) return
              setLinkedSplitId(splitId)
              onSaved()
              onClose()
            }}
            defaultTitle={form.description || undefined}
            defaultAmount={form.amount || undefined}
            defaultDate={form.date}
            defaultCategory={form.category || undefined}
            defaultCardId={form.card_id}
            tripId={form.trip_id}
            contactId={form.contact_ids[0] ?? null}
            defaultParticipants={defaultParticipants}
          />
        )
      })()}
    </>
  )
}
