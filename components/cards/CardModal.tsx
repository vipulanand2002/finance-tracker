'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImageIcon, Loader2, Search, Sparkles, Upload, X } from 'lucide-react'
import { getBankLogoUrl } from '@/lib/bank-logos'
import {
  GENERIC_BY_ID, GENERIC_DESIGNS, LEGACY_IDS, detectNetwork, matchCatalog, networkFromText, resolveLook, typeFromText,
  type Network,
} from '@/lib/card-catalog'
import { cn } from '@/lib/utils'
import CardDisplay, { type CardData } from './CardDisplay'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  card?: CardData | null
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const empty = {
  card_name: '',
  bank_name: '',
  card_number: '',
  card_type: 'credit' as CardData['card_type'],
  expiry_month: '',
  expiry_year: '',
  holder_name: '',
  cycle_start_day: '',
  statement_day: '',
}

const NETWORK_OPTIONS: { value: 'auto' | Network; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'rupay', label: 'RuPay' },
  { value: 'amex', label: 'Amex' },
]
const NETWORK_NAME: Record<Network, string> = { visa: 'Visa', mastercard: 'Mastercard', rupay: 'RuPay', amex: 'American Express', other: '' }

interface ArtResult { thumb: string; url: string; title: string }

export default function CardModal({ open, onClose, onSaved, card }: Props) {
  const [form, setForm] = useState(empty)
  const [networkChoice, setNetworkChoice] = useState<'auto' | Network>('auto')
  // 'auto' (look chosen from the name), a design id, or 'img:<url>'
  const [design, setDesign] = useState('auto')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  // Fields the user has typed into themselves are never overwritten by name matching
  const bankTouched = useRef(false)
  const typeTouched = useRef(false)

  // Card art: pick a design, upload a picture, or find one online
  const [artTab, setArtTab] = useState<'designs' | 'upload' | 'online'>('designs')
  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ArtResult[] | null>(null)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [linkText, setLinkText] = useState('')
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setForm(empty)
    setNetworkChoice('auto')
    setDesign('auto')
    setLogoUrl('')
    setArtTab('designs')
    setResults(null)
    setSearchNote(null)
    setLinkText('')
    setSearchText('')
    bankTouched.current = false
    typeTouched.current = false
  }

  useEffect(() => {
    if (!open) return
    // Loading the form for the card being edited (or a blank one) when the dialog opens
    /* eslint-disable react-hooks/set-state-in-effect */
    if (card) {
      setForm({
        card_name: card.card_name,
        bank_name: card.bank_name,
        card_number: `•••• •••• •••• ${card.last_four}`,
        card_type: card.card_type,
        expiry_month: card.expiry_month ? String(card.expiry_month) : '',
        expiry_year: card.expiry_year ? String(card.expiry_year) : '',
        holder_name: card.holder_name ?? '',
        cycle_start_day: card.cycle_start_day ? String(card.cycle_start_day) : '',
        statement_day: card.statement_day ? String(card.statement_day) : '',
      })
      setNetworkChoice(card.network !== 'other' ? card.network : 'auto')
      setDesign(card.color.startsWith('img:') || (GENERIC_BY_ID.has(card.color) && !LEGACY_IDS.has(card.color)) ? card.color : 'auto')
      setLogoUrl(card.logo_url ?? '')
      setSearchText(`${card.card_name} ${card.bank_name}`.trim())
      bankTouched.current = true
      typeTouched.current = true
    } else {
      reset()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [card, open])

  // ── What we know about the card from what's been typed ──
  const digits = form.card_number.replace(/\D/g, '')
  const isMasked = form.card_number.includes('•')
  const match = matchCatalog(form.card_name, form.bank_name)
  const numberNetwork = isMasked ? 'other' : detectNetwork(digits)
  const nameNetwork = networkFromText(`${form.card_name} ${form.bank_name}`)
  const autoNetwork: Network = numberNetwork !== 'other' ? numberNetwork : (nameNetwork !== 'other' ? nameNetwork : (match?.network ?? 'other'))
  const network: Network = networkChoice === 'auto' ? autoNetwork : networkChoice

  function handleBankNameChange(value: string) {
    bankTouched.current = true
    setForm(f => ({ ...f, bank_name: value }))
    setLogoUrl(value.trim().length >= 2 ? getBankLogoUrl(value) : '')
  }

  function handleCardNameChange(value: string) {
    setForm(f => {
      const next = { ...f, card_name: value }
      const m = matchCatalog(value, f.bank_name)
      // A recognised card fills in what it knows — unless the user already set it
      if (m?.bank && !bankTouched.current) {
        next.bank_name = m.bank
        setLogoUrl(getBankLogoUrl(m.bank))
      }
      if (!typeTouched.current) {
        const t = typeFromText(value) ?? m?.type
        if (t) next.card_type = t
      }
      return next
    })
    if (!searchText || searchText === `${form.card_name} ${form.bank_name}`.trim()) setSearchText(`${value} ${form.bank_name}`.trim())
  }

  function handleCardNumberChange(value: string) {
    const d = value.replace(/\D/g, '').slice(0, 16)
    setForm(f => ({ ...f, card_number: d.replace(/(.{4})/g, '$1 ').trim() }))
  }

  // ── Card art ──
  async function searchOnline() {
    const q = searchText.trim()
    if (q.length < 3) { toast.error('Type the card name to search'); return }
    setSearching(true)
    setResults(null)
    try {
      const res = await fetch(`/api/cards/art-search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(Array.isArray(data.results) ? data.results : [])
      setSearchNote(data.note ?? null)
      if (!data.results?.length && !data.note) toast.info('No pictures found — try a simpler name, or upload your own')
    } catch {
      setResults([])
      toast.error('Search isn’t available right now — you can upload a picture instead')
    } finally {
      setSearching(false)
    }
  }

  async function chooseOnline(url: string) {
    setBusyUrl(url)
    try {
      const res = await fetch('/api/cards/art', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not use that image')
      setDesign(`img:${data.url}`)
      toast.success('Card picture applied')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not use that image')
    } finally {
      setBusyUrl(null)
    }
  }

  async function uploadPicture(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/cards/art', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not use that image')
      setDesign(`img:${data.url}`)
      toast.success('Card picture applied')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not use that image')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Preview + save ──
  const previewCard: CardData = {
    id: '',
    card_name: form.card_name || 'Card name',
    bank_name: form.bank_name || 'Bank name',
    last_four: digits.slice(-4) || '0000',
    card_type: form.card_type,
    network,
    expiry_month: form.expiry_month ? parseInt(form.expiry_month) : null,
    expiry_year: form.expiry_year ? parseInt(form.expiry_year) : null,
    holder_name: form.holder_name || null,
    color: design,
    logo_url: logoUrl || null,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const lastFour = digits.slice(-4)
    if (lastFour.length !== 4) { toast.error('Enter the card number, or at least its last 4 digits'); return }
    if (!form.bank_name.trim()) { toast.error('Enter the bank name'); return }
    if (!form.card_name.trim()) { toast.error('Enter a card name'); return }

    setSaving(true)
    try {
      const payload = {
        card_name: form.card_name.trim(),
        bank_name: form.bank_name.trim(),
        last_four: lastFour,
        card_type: form.card_type,
        network,
        expiry_month: form.expiry_month ? parseInt(form.expiry_month) : null,
        expiry_year: form.expiry_year ? parseInt(form.expiry_year) : null,
        holder_name: form.holder_name.trim() || null,
        color: design,
        logo_url: logoUrl || null,
        cycle_start_day: form.cycle_start_day ? parseInt(form.cycle_start_day) : null,
        statement_day: form.statement_day ? parseInt(form.statement_day) : null,
      }

      const res = await fetch(card ? `/api/cards?id=${card.id}` : '/api/cards', {
        method: card ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed')

      toast.success(card ? 'Card updated!' : 'Card added!')
      onSaved()
      reset()
      onClose()
    } catch {
      toast.error('Failed to save card')
    } finally {
      setSaving(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i)
  const autoLook = resolveLook({ card_name: form.card_name, bank_name: form.bank_name, color: 'auto' })
  const usingImage = design.startsWith('img:')

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? 'Edit Card' : 'Add Card'}</DialogTitle>
        </DialogHeader>

        {/* Live card preview */}
        <div className="rounded-xl bg-muted/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-sm">
            <CardDisplay card={previewCard} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Card Name first: it can fill in the rest */}
          <div className="space-y-1">
            <Label>Card Name *</Label>
            <Input
              placeholder="e.g. HDFC Infinia, Amazon Pay ICICI, SBI RuPay Platinum"
              value={form.card_name}
              onChange={e => handleCardNameChange(e.target.value)}
              required
            />
            {match ? (
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Recognised: {match.label}
                {match.network ? ` · ${NETWORK_NAME[match.network]}` : ''} — design applied
              </p>
            ) : form.card_name.trim().length > 2 ? (
              <p className="text-xs text-muted-foreground">Not in our list — pick a design below, or upload / find a picture of the card.</p>
            ) : null}
          </div>

          {/* Bank Name */}
          <div className="space-y-1">
            <Label>Bank Name *</Label>
            <Input
              placeholder="e.g. HDFC Bank"
              value={form.bank_name}
              onChange={e => handleBankNameChange(e.target.value)}
              required
            />
          </div>

          {/* Card Number */}
          <div className="space-y-1">
            <Label>Card Number * <span className="text-xs font-normal text-muted-foreground">(or just the last 4 digits)</span></Label>
            <Input
              placeholder="1234 5678 9012 3456"
              value={form.card_number}
              onChange={e => handleCardNumberChange(e.target.value)}
              maxLength={19}
              inputMode="numeric"
            />
          </div>

          {/* Network */}
          <div className="space-y-1.5">
            <Label>Card Network</Label>
            <div className="flex flex-wrap gap-1.5">
              {NETWORK_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setNetworkChoice(o.value)}
                  className={cn(
                    'px-3 py-1 rounded-full border text-xs transition-colors',
                    networkChoice === o.value ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground hover:border-foreground/40',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {networkChoice === 'auto'
                ? (autoNetwork !== 'other' ? `Detected: ${NETWORK_NAME[autoNetwork]}` : 'Couldn’t tell from the number or name — choose one above.')
                : `Set to ${NETWORK_NAME[networkChoice as Network]}`}
            </p>
          </div>

          {/* Card Type */}
          <div className="space-y-1">
            <Label>Card Type</Label>
            <Select value={form.card_type} onValueChange={v => { if (v) { typeTouched.current = true; setForm(f => ({ ...f, card_type: v as typeof form.card_type })) } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="prepaid">Prepaid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Card design ── */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Card design</p>
              {usingImage && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDesign('auto')}>
                  <X className="w-3 h-3 mr-1" /> Remove picture
                </Button>
              )}
            </div>

            <div className="flex items-center bg-muted rounded-lg p-0.5 text-xs">
              {([['designs', 'Designs'], ['upload', 'Upload picture'], ['online', 'Find online']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setArtTab(v)}
                  className={cn('flex-1 px-2 py-1.5 rounded-md transition-colors', artTab === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>

            {artTab === 'designs' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                {/* Auto: the look we pick from the name/bank */}
                <button type="button" onClick={() => setDesign('auto')} className="text-left space-y-1">
                  <div className={cn('rounded-xl ring-offset-2 ring-offset-background', design === 'auto' ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-border')}>
                    <CardDisplay card={previewCard} designOverride={autoLook.design} thumb />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{match ? match.label : 'Auto'}</p>
                </button>
                {GENERIC_DESIGNS.map(g => (
                  <button key={g.id} type="button" onClick={() => setDesign(g.id)} className="text-left space-y-1">
                    <div className={cn('rounded-xl ring-offset-2 ring-offset-background', design === g.id ? 'ring-2 ring-primary' : 'ring-1 ring-transparent hover:ring-border')}>
                      <CardDisplay card={previewCard} designOverride={g} thumb />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{g.name}</p>
                  </button>
                ))}
              </div>
            )}

            {artTab === 'upload' && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  Use a photo or screenshot of your card — or the card art from your bank’s app. Don’t include the full number or CVV; the card shows only the last 4 digits.
                </p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPicture(f) }} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {uploading ? 'Uploading…' : 'Choose a picture'}
                </Button>
              </div>
            )}

            {artTab === 'online' && (
              <div className="space-y-3 pt-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="Card name, e.g. HDFC Infinia"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchOnline() } }}
                  />
                  <Button type="button" onClick={searchOnline} disabled={searching} aria-label="Search">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {results && results.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {results.map(r => (
                      <button
                        key={r.url}
                        type="button"
                        title={r.title}
                        disabled={!!busyUrl}
                        onClick={() => chooseOnline(r.url)}
                        className="relative aspect-[1.586/1] rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary disabled:opacity-60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.thumb} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                        {busyUrl === r.url && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="w-5 h-5 text-white animate-spin" /></span>}
                      </button>
                    ))}
                  </div>
                )}
                {results && results.length === 0 && !searching && !searchNote && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Nothing found. Try a shorter name, or paste a link / upload a picture.</p>
                )}
                {searchNote && (
                  <p className="text-xs text-muted-foreground">
                    {searchNote === 'quota'
                      ? 'Today’s search limit has been reached. '
                      : searchNote === 'not_configured'
                        ? 'In-app search isn’t switched on yet. '
                        : 'Search isn’t available right now. '}
                    Find the card on Google Images, copy the picture’s link, and paste it below.
                  </p>
                )}

                <a
                  href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${searchText || form.card_name} card`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Search className="w-3 h-3" /> Open Google Images in a new tab
                </a>

                <div className="space-y-1">
                  <Label className="text-xs">Or paste an image link</Label>
                  <div className="flex gap-2">
                    <Input placeholder="https://…/card.png" value={linkText} onChange={e => setLinkText(e.target.value)} />
                    <Button type="button" variant="outline" disabled={!!busyUrl || !linkText.trim().toLowerCase().startsWith("https://")} onClick={() => chooseOnline(linkText.trim())}>
                      {busyUrl && busyUrl === linkText.trim() ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Use'}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Pictures belong to their owners — they’re saved only as the look of your own card.</p>
              </div>
            )}
          </div>

          {/* Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Expiry Month</Label>
              <Select value={form.expiry_month} onValueChange={v => v && setForm(f => ({ ...f, expiry_month: v }))}>
                <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <SelectItem key={m} value={String(m)}>
                      {String(m).padStart(2, '0')} — {new Date(2000, m - 1).toLocaleString('en', { month: 'short' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Expiry Year</Label>
              <Select value={form.expiry_year} onValueChange={v => v && setForm(f => ({ ...f, expiry_year: v }))}>
                <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Holder Name */}
          <div className="space-y-1">
            <Label>Card Holder Name <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="YOUR NAME"
              value={form.holder_name}
              onChange={e => setForm(f => ({ ...f, holder_name: e.target.value.toUpperCase() }))}
              className="uppercase"
            />
          </div>

          {/* Billing Cycle */}
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Billing Cycle <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cycle Starts On</Label>
                <Select value={form.cycle_start_day} onValueChange={v => setForm(f => ({ ...f, cycle_start_day: v ?? '' }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <span className="flex-1 truncate text-left text-muted-foreground">
                      {form.cycle_start_day ? `${ordinal(parseInt(form.cycle_start_day))} of month` : 'Not set'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not set</SelectItem>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map(d => (
                      <SelectItem key={d} value={d}>{ordinal(parseInt(d))} of month</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Statement Date</Label>

                <Select value={form.statement_day} onValueChange={v => setForm(f => ({ ...f, statement_day: v ?? '' }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <span className="flex-1 truncate text-left text-muted-foreground">
                      {form.statement_day ? `${ordinal(parseInt(form.statement_day))} of month` : 'Not set'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not set</SelectItem>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map(d => (
                      <SelectItem key={d} value={d}>{ordinal(parseInt(d))} of month</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.statement_day && (
                  <p className="text-[10px] text-emerald-600">Reminder sent for 5 days from this date</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{card ? 'Saving…' : 'Adding…'}</> : card ? 'Save Changes' : 'Add Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
