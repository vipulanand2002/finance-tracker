'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import type { AccountWithBalance } from '@/lib/wallet-providers'

export type TransferMode = 'topup' | 'withdraw' | 'move'

const TITLE: Record<TransferMode, string> = {
  topup: 'Add money',
  withdraw: 'Withdraw',
  move: 'Transfer between accounts',
}

const HELP: Record<TransferMode, string> = {
  topup: 'Money added from outside your tracked accounts (e.g. a top-up from a bank you don’t track, cashback, a refund to the wallet).',
  withdraw: 'Money taken out to somewhere you don’t track. Not counted as an expense.',
  move: 'Moving your own money, e.g. topping up Amazon Pay from your bank account. Not counted as income or an expense.',
}

const OUTSIDE = '__outside__'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  accounts: AccountWithBalance[]
  mode: TransferMode
  /** The account the dialog was opened from */
  accountId?: string | null
}

export default function TransferModal({ open, onClose, onSaved, accounts, mode, accountId }: Props) {
  const [from, setFrom] = useState<string>(OUTSIDE)
  const [to, setTo] = useState<string>(OUTSIDE)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const active = accounts.filter(a => !a.is_archived)

  useEffect(() => {
    if (!open) return
    const first = accountId ?? active[0]?.id ?? OUTSIDE
    const other = active.find(a => a.id !== first)?.id ?? OUTSIDE
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form each time the dialog opens */
    if (mode === 'topup') { setFrom(OUTSIDE); setTo(first) }
    else if (mode === 'withdraw') { setFrom(first); setTo(OUTSIDE) }
    else { setFrom(other); setTo(first) }
    setAmount('')
    setNote('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, accountId])

  const label = (id: string) => {
    if (id === OUTSIDE) return 'Outside (not tracked)'
    const a = accounts.find(x => x.id === id)
    return a ? `${a.name} · ${formatCurrency(a.balance)}` : 'Select'
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { toast.warning('Enter an amount above zero'); return }
    if (from === to) { toast.warning('Pick two different accounts'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/account-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: from === OUTSIDE ? null : from,
          to_account_id: to === OUTSIDE ? null : to,
          amount: n,
          date,
          note,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save')
      }
      toast.success(mode === 'topup' ? 'Money added' : mode === 'withdraw' ? 'Withdrawal recorded' : 'Transfer recorded')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const picker = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={v => { if (v) onChange(v) }}>
      <SelectTrigger className="w-full">
        <span className="truncate text-sm">{label(value)}</span>
      </SelectTrigger>
      <SelectContent>
        {active.map(a => <SelectItem key={a.id} value={a.id}>{a.name} · {formatCurrency(a.balance)}</SelectItem>)}
      </SelectContent>
    </Select>
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE[mode]}</DialogTitle>
          <DialogDescription>{HELP[mode]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {mode !== 'topup' && (
            <div className="space-y-1.5">
              <Label>From</Label>
              {picker(from, setFrom)}
            </div>
          )}
          {mode !== 'withdraw' && (
            <div className="space-y-1.5">
              <Label>{mode === 'topup' ? 'Into' : 'To'}</Label>
              {picker(to, setTo)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-amount">Amount</Label>
              <Input id="tr-amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-date">Date</Label>
              <Input id="tr-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-note">Note (optional)</Label>
            <Input id="tr-note" value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'topup' ? 'e.g. Cashback, refund' : 'e.g. Monthly top-up'} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
