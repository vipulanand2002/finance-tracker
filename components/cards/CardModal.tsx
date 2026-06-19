'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { getBankLogoUrl, detectNetwork, getCardTheme } from '@/lib/bank-logos'
import CardDisplay, { CARD_GRADIENTS, type CardData } from './CardDisplay'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  card?: CardData | null
}

const COLORS = Object.keys(CARD_GRADIENTS) as (keyof typeof CARD_GRADIENTS)[]

const empty = {
  card_name: '',
  bank_name: '',
  card_number: '',
  card_type: 'credit' as CardData['card_type'],
  expiry_month: '',
  expiry_year: '',
  holder_name: '',
  color: 'blue',
}

export default function CardModal({ open, onClose, onSaved, card }: Props) {
  const [form, setForm] = useState(empty)
  const [detectedNetwork, setDetectedNetwork] = useState<CardData['network']>('other')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (card) {
      setForm({
        card_name: card.card_name,
        bank_name: card.bank_name,
        card_number: `•••• •••• •••• ${card.last_four}`,
        card_type: card.card_type,
        expiry_month: card.expiry_month ? String(card.expiry_month) : '',
        expiry_year: card.expiry_year ? String(card.expiry_year) : '',
        holder_name: card.holder_name ?? '',
        color: card.color,
      })
      setDetectedNetwork(card.network)
      setLogoUrl(card.logo_url ?? '')
    } else {
      reset()
    }
  }, [card, open])

  function reset() {
    setForm(empty)
    setDetectedNetwork('other')
    setLogoUrl('')
  }

  // Debounced bank logo fetch when bank name changes
  const fetchLogo = useCallback((bankName: string) => {
    if (bankName.trim().length < 2) { setLogoUrl(''); return }
    const url = getBankLogoUrl(bankName)
    setLogoUrl(url)
  }, [])

  function handleBankNameChange(value: string) {
    setForm(f => ({ ...f, bank_name: value }))
    fetchLogo(value)
  }

  function handleCardNumberChange(value: string) {
    // Format as groups of 4
    const digits = value.replace(/\D/g, '').slice(0, 16)
    const formatted = digits.replace(/(.{4})/g, '$1 ').trim()
    setForm(f => ({ ...f, card_number: formatted }))
    setDetectedNetwork(detectNetwork(digits))
  }

  // Build preview card object
  const previewCard: CardData = {
    id: '',
    card_name: form.card_name || 'Card Name',
    bank_name: form.bank_name || 'Bank Name',
    last_four: form.card_number.replace(/\D/g, '').slice(-4) || '0000',
    card_type: form.card_type,
    network: detectedNetwork,
    expiry_month: form.expiry_month ? parseInt(form.expiry_month) : null,
    expiry_year: form.expiry_year ? parseInt(form.expiry_year) : null,
    holder_name: form.holder_name || null,
    color: form.color,
    logo_url: logoUrl || null,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const rawDigits = form.card_number.replace(/\D/g, '')
    const lastFour = rawDigits.slice(-4)
    if (lastFour.length !== 4) { toast.error('Enter a valid card number'); return }
    if (!form.bank_name.trim()) { toast.error('Enter the bank name'); return }
    if (!form.card_name.trim()) { toast.error('Enter a card name'); return }

    setSaving(true)
    try {
      const payload = {
        card_name: form.card_name.trim(),
        bank_name: form.bank_name.trim(),
        last_four: lastFour,
        card_type: form.card_type,
        network: detectedNetwork,
        expiry_month: form.expiry_month ? parseInt(form.expiry_month) : null,
        expiry_year: form.expiry_year ? parseInt(form.expiry_year) : null,
        holder_name: form.holder_name.trim() || null,
        color: form.color,
        logo_url: logoUrl || null,
      }

      const url = card ? `/api/cards?id=${card.id}` : '/api/cards'
      const method = card ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? 'Edit Card' : 'Add Card'}</DialogTitle>
        </DialogHeader>

        {/* Live card preview */}
        <div className="px-2">
          <CardDisplay card={previewCard} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Bank Name *</Label>
              <Input
                placeholder="e.g. HDFC Bank"
                value={form.bank_name}
                onChange={e => handleBankNameChange(e.target.value)}
                required
              />
              {logoUrl && (
                <p className="text-xs text-muted-foreground">
                  Logo fetched via Google services
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Card Name *</Label>
              <Input
                placeholder="e.g. Amazon Pay ICICI Credit Card"
                value={form.card_name}
                onChange={e => setForm(f => ({ ...f, card_name: e.target.value }))}
                required
              />
              {getCardTheme(form.card_name) && (
                <p className="text-xs text-emerald-600">
                  Known card detected — design applied automatically
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Card Number *</Label>
              <Input
                placeholder="1234 5678 9012 3456"
                value={form.card_number}
                onChange={e => handleCardNumberChange(e.target.value)}
                maxLength={19}
                inputMode="numeric"
              />
              {detectedNetwork !== 'other' && (
                <p className="text-xs text-muted-foreground capitalize">
                  Detected: {detectedNetwork === 'mastercard' ? 'Mastercard' : detectedNetwork.toUpperCase()}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Card Type</Label>
              <Select value={form.card_type} onValueChange={v => v && setForm(f => ({ ...f, card_type: v as typeof form.card_type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className={getCardTheme(form.card_name) ? 'text-muted-foreground' : ''}>
                Card Color {getCardTheme(form.card_name) && <span className="text-xs font-normal">(overridden by card theme)</span>}
              </Label>
              <Select
                value={form.color}
                onValueChange={v => v && setForm(f => ({ ...f, color: v }))}
                disabled={Boolean(getCardTheme(form.card_name))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map(c => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            <div className="col-span-2 space-y-1">
              <Label>Card Holder Name</Label>
              <Input
                placeholder="YOUR NAME"
                value={form.holder_name}
                onChange={e => setForm(f => ({ ...f, holder_name: e.target.value.toUpperCase() }))}
                className="uppercase"
              />
            </div>

          </div>

          <DialogFooter>
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
