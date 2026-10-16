'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { WALLET_PROVIDERS, KIND_LABEL, getProvider, type Account } from '@/lib/wallet-providers'
import AccountLogo from './AccountLogo'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Edit this account; omit to add a new one */
  account?: Account | null
}

function emptyForm() {
  return { provider: 'amazon_pay', name: 'Amazon Pay', opening_balance: '', notes: '' }
}

export default function AccountModal({ open, onClose, onSaved, account }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  // Whether the user typed their own name — if not, picking a provider renames it
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    setForm(account
      ? { provider: account.provider ?? 'other', name: account.name, opening_balance: String(account.opening_balance ?? ''), notes: account.notes ?? '' }
      : emptyForm())
    setNameTouched(!!account)
  }, [open, account])

  const provider = getProvider(form.provider)

  function pickProvider(key: string) {
    const p = getProvider(key)
    setForm(prev => ({ ...prev, provider: key, name: nameTouched ? prev.name : (p?.label ?? prev.name) }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.warning('Give the account a name'); return }
    const opening = form.opening_balance.trim() === '' ? 0 : Number(form.opening_balance)
    if (!Number.isFinite(opening)) { toast.warning('Enter a valid opening balance'); return }

    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        provider: form.provider,
        kind: provider?.kind ?? 'other',
        color: provider?.color ?? null,
        opening_balance: opening,
        notes: form.notes,
      }
      const res = await fetch(account ? `/api/accounts?id=${account.id}` : '/api/accounts', {
        method: account ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save')
      }
      toast.success(account ? 'Account updated' : 'Account added')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit account' : 'Add wallet or account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.provider} onValueChange={v => { if (v) pickProvider(v) }}>
              <SelectTrigger className="w-full">
                <span className="flex items-center gap-2 truncate text-sm">
                  <AccountLogo provider={form.provider} size={20} />
                  {provider?.label ?? 'Choose'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {WALLET_PROVIDERS.map(p => (
                  <SelectItem key={p.key} value={p.key}>
                    <span className="flex items-center gap-2">
                      <AccountLogo provider={p.key} size={18} />
                      {p.label}
                      {p.kind !== 'wallet' && <span className="text-xs text-muted-foreground">· {KIND_LABEL[p.kind]}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input
              id="acc-name"
              value={form.name}
              placeholder="e.g. Amazon Pay balance"
              onChange={e => { setNameTouched(true); setForm(prev => ({ ...prev, name: e.target.value })) }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-opening">{account ? 'Opening balance' : 'Current balance'}</Label>
            <Input
              id="acc-opening"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.opening_balance}
              placeholder="0"
              onChange={e => setForm(prev => ({ ...prev, opening_balance: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {account
                ? 'The balance before anything recorded here. Changing it shifts the current balance by the same amount.'
                : 'What’s in it right now. Expenses, income and top-ups you record will adjust it from here.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-notes">Notes (optional)</Label>
            <Textarea
              id="acc-notes"
              rows={2}
              value={form.notes}
              placeholder="Linked phone number, card number ending, expiry…"
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {account ? 'Save' : 'Add account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
