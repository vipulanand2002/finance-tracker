'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { format, isValid, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Upload, Loader2, CheckSquare, Square, Eye, EyeOff,
  ChevronDown, ChevronUp, FileText, ArrowUpCircle, ArrowDownCircle, KeyRound,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import type { Trip, Contact } from '@/types'

interface EditableTx {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  note: string
  trip_id: string | null
  contact_id: string | null
  split_enabled: boolean
  split_amount: string
  selected: boolean
  expanded: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  cardId?: string
  cardName?: string
  savedPassword?: string | null
}

function safeDate(s: string) { const d = parseISO(s); return isValid(d) ? d : null }
function monthKey(s: string) { const d = safeDate(s); return d ? format(d, 'MMMM yyyy') : 'Unknown Date' }
function monthSortKey(k: string) { const d = new Date(k + ' 01'); return isValid(d) ? d.getTime() : 0 }

export default function CardPDFImport({ open, onClose, onImported, cardId, cardName, savedPassword }: Props) {
  const [step, setStep] = useState<'upload' | 'review' | 'importing'>('upload')
  const [transactions, setTransactions] = useState<EditableTx[]>([])
  const [parsing, setParsing] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [statementDay, setStatementDay] = useState('')
  const [filename, setFilename] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [cycleStart, setCycleStart] = useState('')
  const [cycleEnd, setCycleEnd] = useState('')
  const [trips, setTrips] = useState<Trip[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [expenseCategories, setExpenseCategories] = useState<string[]>([...EXPENSE_CATEGORIES])
  const [incomeCategories, setIncomeCategories] = useState<string[]>([...INCOME_CATEGORIES])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && savedPassword) setPassword(savedPassword)
  }, [open, savedPassword])

  useEffect(() => {
    if (!open) return
    fetch('/api/trips').then(r => r.json()).then(d => setTrips(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/contacts').then(r => r.json()).then(d => setContacts(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: { list_type: string; name: string }[]) => {
        if (!Array.isArray(data) || data.length === 0) return
        setExpenseCategories(data.filter(c => c.list_type === 'expense').map(c => c.name))
        setIncomeCategories(data.filter(c => c.list_type === 'income').map(c => c.name))
      })
      .catch(() => {})
  }, [open])

  function reset() {
    setStep('upload')
    setTransactions([])
    setStatementDay('')
    setFilename('')
    setParseError(null)
    setCycleStart('')
    setCycleEnd('')
    if (fileRef.current) fileRef.current.value = ''
    // Keep password pre-filled for convenience
  }

  async function savePasswordToCard(pwd: string) {
    if (!cardId || !pwd) return
    try {
      await fetch(`/api/cards?id=${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_password: pwd }),
      })
    } catch {
      // Silent — not critical
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { toast.error('Please select a PDF file'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('File too large. Max 20MB'); return }

    setFilename(file.name)
    setParseError(null)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      if (password) fd.append('password', password)
      if (statementDay) fd.append('statementDay', statementDay)
      if (cardId) fd.append('is_card', 'true')

      const res = await fetch('/api/pdf', { method: 'POST', body: fd })

      let data: any
      try {
        data = await res.json()
      } catch {
        toast.error('Server error — the PDF may be too large or took too long to process. Try a smaller statement.')
        return
      }

      if (data.error) {
        const pwdHeader = res.headers.get('X-Password-Error')
        if (pwdHeader === 'wrong') {
          toast.error('Incorrect password. Please check and try again.')
        } else if (pwdHeader === 'needed') {
          toast.error('This PDF is password-protected. Enter the password above.')
        } else if (res.status === 429) {
          setParseError(data.error)
        } else {
          toast.error(data.error)
        }
        return
      }

      if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
        toast.error('No transactions found in this PDF')
        return
      }

      const parsed: EditableTx[] = data.transactions.map(
        (t: Omit<EditableTx, 'note' | 'trip_id' | 'contact_id' | 'selected' | 'expanded'>) => ({
          ...t, note: '', trip_id: null, contact_id: null, split_enabled: false, split_amount: '', selected: true, expanded: false,
        })
      )
      setTransactions(parsed)

      // Pre-fill cycle range from min/max transaction dates; user can adjust
      if (cardId) {
        const dates = parsed.map(t => t.date).filter(Boolean).sort()
        if (dates.length > 0) {
          setCycleStart(dates[0])
          setCycleEnd(dates[dates.length - 1])
        }
      }

      setStep('review')

      // Password worked — save it to the card for future use
      if (password) {
        await savePasswordToCard(password)
        if (!savedPassword || savedPassword !== password) {
          toast.success(`Password saved for ${cardName ?? 'this card'}`)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse PDF')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function updateTx(idx: number, patch: Partial<EditableTx>) {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }

  const monthGroups = useCallback(() => {
    const map = new Map<string, { txs: EditableTx[]; indices: number[] }>()
    transactions.forEach((t, i) => {
      const key = monthKey(t.date)
      if (!map.has(key)) map.set(key, { txs: [], indices: [] })
      map.get(key)!.txs.push(t)
      map.get(key)!.indices.push(i)
    })
    return [...map.entries()].sort((a, b) => monthSortKey(b[0]) - monthSortKey(a[0]))
  }, [transactions])

  async function handleImport() {
    const selected = transactions.filter(t => t.selected)
    if (selected.length === 0) { toast.error('Select at least one transaction'); return }
    setStep('importing')
    let imported = 0, failed = 0

    for (const t of selected) {
      try {
        const desc = [t.description, t.note].filter(Boolean).join(' — ')
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: t.amount, type: t.type, category: t.category,
            description: desc, date: t.date, is_recurring: false, receipt_url: null,
            trip_id: t.trip_id ?? null,
            contact_id: t.contact_id ?? null,
            card_id: cardId ?? null,
          }),
        })
        if (res.ok) {
          imported++
          // Create a split if requested
          if (t.split_enabled && t.contact_id && t.split_amount && parseFloat(t.split_amount) > 0) {
            const contact = contacts.find(c => c.id === t.contact_id)
            if (contact) {
              await fetch('/api/splits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: t.description,
                  total_amount: t.amount,
                  category: t.category,
                  date: t.date,
                  contact_id: t.contact_id,
                  participants: [
                    { name: contact.name, email: contact.email ?? '', amount: parseFloat(t.split_amount) },
                  ],
                }),
              }).catch(() => {})
            }
          }
        } else {
          failed++
        }
      } catch { failed++ }
    }

    if (imported > 0) {
      toast.success(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`)
      // Save billing cycle using the user-selected dates
      if (cardId && cycleStart && cycleEnd) {
        await fetch('/api/card-statements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: cardId, cycle_start: cycleStart, cycle_end: cycleEnd }),
        }).catch(() => {})
      }
      onImported(); reset(); onClose()
    } else {
      toast.error('Import failed. Please try again.')
      setStep('review')
    }
  }

  const selectedCount = transactions.filter(t => t.selected).length
  const groups = monthGroups()

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {cardName ? `Import Statement — ${cardName}` : 'Import Bank Statement'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Upload step ── */}
        {step === 'upload' && (
          <div className="flex-1 overflow-y-auto space-y-4 py-1">
            {parsing ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {password ? 'Decrypting and reading statement…' : 'AI is reading your statement…'}
                </p>
              </div>
            ) : (
              <>
                {/* PDF password */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    PDF Password
                    <span className="text-muted-foreground font-normal text-xs">
                      {savedPassword ? '(saved from last time)' : '(leave blank if none)'}
                    </span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={savedPassword ? '••••••••' : 'Enter PDF password if protected'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Common formats — HDFC: DDMMYYYY · ICICI: first 4 letters of name + birth year · Axis: DDMMYYYY · SBI: account no. + birth date
                  </p>
                </div>

                {/* Statement generation day */}
                <div className="space-y-1.5">
                  <Label>
                    Statement Generation Day
                    <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                  </Label>
                  <Input
                    type="number" min="1" max="31"
                    placeholder="e.g. 17"
                    value={statementDay}
                    onChange={e => setStatementDay(e.target.value)}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    The day each month when your statement is generated — helps AI correctly classify transactions that span two calendar months.
                  </p>
                </div>

                {/* API error banner (e.g. quota exceeded) */}
                {parseError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {parseError}
                  </div>
                )}

                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium text-sm">Click to select PDF statement</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Max 20MB · HDFC, ICICI, SBI, Axis, Kotak &amp; more
                    </p>
                  </div>
                  <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Review step ── */}
        {(step === 'review' || step === 'importing') && (
          <>
            {/* Controls bar */}
            <div className="flex items-center justify-between py-2 border-b shrink-0">
              <button
                onClick={() => {
                  const allSel = transactions.every(t => t.selected)
                  setTransactions(prev => prev.map(t => ({ ...t, selected: !allSel })))
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {transactions.every(t => t.selected) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {selectedCount} / {transactions.length} selected
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">{filename}</span>
                {step === 'review' && (
                  <Button variant="ghost" size="sm" onClick={reset}>Upload different file</Button>
                )}
              </div>
            </div>

            {/* Billing cycle date range — only for card imports */}
            {cardId && step === 'review' && (
              <div className="flex items-center gap-3 px-3 py-2.5 border-b bg-muted/20 shrink-0">
                <span className="text-xs font-medium text-muted-foreground shrink-0">Billing Cycle</span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Input
                    type="date"
                    value={cycleStart}
                    onChange={e => setCycleStart(e.target.value)}
                    className="h-7 text-xs flex-1 min-w-0"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">to</span>
                  <Input
                    type="date"
                    value={cycleEnd}
                    onChange={e => setCycleEnd(e.target.value)}
                    className="h-7 text-xs flex-1 min-w-0"
                  />
                </div>
              </div>
            )}


            {step === 'importing' ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Importing transactions…</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y">
                {groups.map(([month, { txs, indices }]) => {
                  const monthSelected = txs.filter(t => t.selected).length
                  const monthNet = txs.reduce((s, t) => t.type === 'expense' ? s - t.amount : s + t.amount, 0)

                  return (
                    <div key={month}>
                      {/* Month header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-background border-b sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                            const allSel = txs.every(t => t.selected)
                            setTransactions(prev => prev.map((t, i) =>
                              indices.includes(i) ? { ...t, selected: !allSel } : t
                            ))
                          }}>
                            {txs.every(t => t.selected)
                              ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                              : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                          </button>
                          <span className="text-xs font-semibold">{month}</span>
                          <span className="text-xs text-muted-foreground">({monthSelected}/{txs.length})</span>
                        </div>
                        <span className={`text-xs font-medium ${monthNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {monthNet >= 0 ? '+' : ''}{formatCurrency(Math.abs(monthNet))}
                        </span>
                      </div>

                      {txs.map((tx, relIdx) => {
                        const absIdx = indices[relIdx]
                        const d = safeDate(tx.date)
                        return (
                          <div key={absIdx} className={tx.selected ? '' : 'bg-muted/30'}>
                            {/* Row */}
                            <div className={`flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 ${!tx.selected ? 'text-muted-foreground' : ''}`}>
                              <input
                                type="checkbox"
                                checked={tx.selected}
                                onChange={() => updateTx(absIdx, { selected: !tx.selected })}
                                className="w-3.5 h-3.5 shrink-0 rounded"
                              />
                              <span className="text-xs text-muted-foreground w-14 shrink-0">
                                {d ? format(d, 'd MMM') : '—'}
                              </span>
                              <span className="text-sm flex-1 min-w-0 truncate">{tx.description}</span>
                              <span className={`text-sm font-semibold shrink-0 ${tx.selected ? (tx.type === 'income' ? 'text-emerald-600' : 'text-red-600') : 'text-muted-foreground'}`}>
                                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                              </span>
                              <button
                                onClick={() => updateTx(absIdx, { expanded: !tx.expanded })}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                {tx.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>

                            {/* Expanded edit panel */}
                            {tx.expanded && (
                              <div className="px-9 pb-3 pt-1 space-y-2.5 bg-muted/10 border-b">
                                <div className="space-y-1">
                                  <Label className="text-xs">Description</Label>
                                  <Input
                                    value={tx.description}
                                    onChange={e => updateTx(absIdx, { description: e.target.value })}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Category</Label>
                                    <Select value={tx.category} onValueChange={v => v && updateTx(absIdx, { category: v })}>
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(tx.type === 'income' ? incomeCategories : expenseCategories).map(c => (
                                          <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Type</Label>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => updateTx(absIdx, { type: 'expense' })}
                                        className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-xs font-medium border transition-colors ${
                                          tx.type === 'expense'
                                            ? 'bg-red-50 border-red-300 text-red-700'
                                            : 'border-border text-muted-foreground hover:bg-muted'
                                        }`}
                                      >
                                        <ArrowDownCircle className="w-3 h-3" /> Debit
                                      </button>
                                      <button
                                        onClick={() => updateTx(absIdx, { type: 'income' })}
                                        className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-xs font-medium border transition-colors ${
                                          tx.type === 'income'
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : 'border-border text-muted-foreground hover:bg-muted'
                                        }`}
                                      >
                                        <ArrowUpCircle className="w-3 h-3" /> Credit
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    Note <span className="text-muted-foreground font-normal">(optional)</span>
                                  </Label>
                                  <Input
                                    value={tx.note}
                                    onChange={e => updateTx(absIdx, { note: e.target.value })}
                                    className="h-8 text-sm"
                                    placeholder="Add a personal note…"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                  {contacts.length > 0 && (
                                    <div className="space-y-1">
                                      <Label className="text-xs">
                                        Contact <span className="text-muted-foreground font-normal">(optional)</span>
                                      </Label>
                                      <Select
                                        value={tx.contact_id ?? 'none'}
                                        onValueChange={v => updateTx(absIdx, { contact_id: v === 'none' ? null : v })}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue placeholder="Link to a contact" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">No contact</SelectItem>
                                          {contacts.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {trips.length > 0 && (
                                    <div className="space-y-1">
                                      <Label className="text-xs">
                                        Trip <span className="text-muted-foreground font-normal">(optional)</span>
                                      </Label>
                                      <Select
                                        value={tx.trip_id ?? 'none'}
                                        onValueChange={v => updateTx(absIdx, { trip_id: v === 'none' ? null : v })}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
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
                                </div>

                                {/* Split — only when a contact is selected */}
                                {tx.contact_id && tx.type === 'expense' && (
                                  <div className="space-y-1.5 pt-1 border-t">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        id={`split-${absIdx}`}
                                        checked={tx.split_enabled}
                                        onChange={e => updateTx(absIdx, {
                                          split_enabled: e.target.checked,
                                          split_amount: e.target.checked
                                            ? (tx.amount / 2).toFixed(2)
                                            : '',
                                        })}
                                        className="w-3.5 h-3.5 rounded"
                                      />
                                      <Label htmlFor={`split-${absIdx}`} className="text-xs cursor-pointer">
                                        Create split with {contacts.find(c => c.id === tx.contact_id)?.name}
                                      </Label>
                                    </div>
                                    {tx.split_enabled && (
                                      <div className="flex items-center gap-2 pl-5">
                                        <Label className="text-xs text-muted-foreground shrink-0">Their share</Label>
                                        <Input
                                          type="number"
                                          min="0.01"
                                          step="0.01"
                                          value={tx.split_amount}
                                          onChange={e => updateTx(absIdx, { split_amount: e.target.value })}
                                          className="h-7 text-xs w-28"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                          of {formatCurrency(tx.amount)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

            <DialogFooter className="border-t pt-3 shrink-0">
              <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
              <Button onClick={handleImport} disabled={selectedCount === 0 || step === 'importing'}>
                Import {selectedCount} transaction{selectedCount !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
