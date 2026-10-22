'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { FriendPicker } from '@/components/friends/FriendPicker'
import { formatCurrency } from '@/lib/utils'
import type { Friend } from '@/types'

// The one split editor used everywhere a transaction can be split (Add Transaction
// popup, card statement import, …): split modes, friend picker and live allocation.

export type SplitMode = 'equal' | 'percent' | 'shares' | 'exact'
export interface SplitParticipant { name: string; email: string; amount: string; percent: string; shares: string; manual?: boolean }
export const mkParticipant = (name = '', email = ''): SplitParticipant => ({ name, email, amount: '', percent: '', shares: '' })

export const round2 = (n: number) => Math.round(n * 100) / 100

// Distribute `total` across `weights`, spreading rounding remainder by largest
// fractional part so the parts always sum back to exactly `total`.
export function distributeAmounts(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (!(sumW > 0) || !(total > 0)) return weights.map(() => 0)
  const cents = Math.round(total * 100)
  const raw = weights.map(w => (w / sumW) * cents)
  const floor = raw.map(r => Math.floor(r))
  const rem = cents - floor.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac)
  const res = [...floor]
  for (let k = 0; k < rem; k++) res[order[k % res.length].i]++
  return res.map(c => c / 100)
}

// Per-participant owed amounts for the active split mode
export function amountsFor(mode: SplitMode, ps: SplitParticipant[], total: number): number[] {
  if (mode === 'equal') return distributeAmounts(total, ps.map(() => 1))
  if (mode === 'shares') return distributeAmounts(total, ps.map(p => parseFloat(p.shares) || 0))
  if (mode === 'percent') return ps.map(p => round2(total * (parseFloat(p.percent) || 0) / 100))
  return ps.map(p => parseFloat(p.amount) || 0)
}

// Exact mode only: keep rows the user typed into (manual) fixed and split the
// leftover equally across the still-untouched named rows. Editing one person
// therefore re-flows the rest; editing a second leaves the first alone.
export function autoBalanceExact(list: SplitParticipant[], total: number): SplitParticipant[] {
  if (!(total > 0)) return list
  const named = list.map((p, idx) => ({ p, idx })).filter(x => x.p.name.trim())
  const autoIdx = named.filter(x => !x.p.manual).map(x => x.idx)
  if (autoIdx.length === 0) return list
  const manualSum = named
    .filter(x => x.p.manual)
    .reduce((s, x) => s + (parseFloat(x.p.amount) || 0), 0)
  const remaining = Math.max(0, round2(total - manualSum))
  const shares = distributeAmounts(remaining, autoIdx.map(() => 1))
  const shareFor = new Map<number, number>()
  autoIdx.forEach((idx, k) => shareFor.set(idx, shares[k]))
  return list.map((p, idx) => shareFor.has(idx) ? { ...p, amount: String(shareFor.get(idx)) } : p)
}

export interface SplitValue { mode: SplitMode; participants: SplitParticipant[] }

interface Props {
  total: number
  value: SplitValue
  onChange: (next: SplitValue) => void
  friends: Friend[]
  currentUser?: { name: string; email: string } | null
}

export default function SplitEditor({ total, value, onChange, friends, currentUser }: Props) {
  const { mode: splitMode, participants } = value
  const setParticipants = (ps: SplitParticipant[]) => onChange({ mode: splitMode, participants: ps })
  const rebalance = (ps: SplitParticipant[]) => splitMode === 'exact' ? autoBalanceExact(ps, total) : ps

  // Switch split mode, seeding sensible defaults so the split stays balanced
  function changeSplitMode(mode: SplitMode) {
    const prevAmounts = amountsFor(splitMode, participants, total)
    let next = participants
    if (mode === 'percent') {
      const eq = distributeAmounts(100, participants.map(() => 1)) // equal %s summing to 100
      next = participants.map((p, i) => ({ ...p, percent: p.percent && parseFloat(p.percent) > 0 ? p.percent : String(eq[i]) }))
    } else if (mode === 'shares') {
      next = participants.map(p => ({ ...p, shares: p.shares && parseFloat(p.shares) > 0 ? p.shares : '1' }))
    } else if (mode === 'exact') {
      // Carry the currently displayed amounts in as a fresh equal split —
      // nothing is pinned yet, so the first edit re-flows the rest.
      next = participants.map((p, i) => ({ ...p, manual: false, amount: prevAmounts[i] ? String(prevAmounts[i]) : p.amount }))
    }
    onChange({ mode, participants: next })
  }

  function updateParticipant(i: number, key: keyof SplitParticipant, val: string) {
    const next = participants.map((p, idx) => idx === i ? { ...p, [key]: val } : p)
    // Naming a new row in Exact mode makes it eligible for an auto share.
    setParticipants(key === 'name' && splitMode === 'exact' ? autoBalanceExact(next, total) : next)
  }

  // Exact mode: typing an amount pins that row and re-splits the leftover across
  // the untouched rows; clearing it returns the row to the auto pool.
  function updateExactAmount(i: number, val: string) {
    setParticipants(autoBalanceExact(
      participants.map((p, idx) => idx === i ? { ...p, amount: val, manual: val.trim() !== '' } : p),
      total,
    ))
  }

  function addParticipant() {
    const row = mkParticipant()
    if (splitMode === 'shares') row.shares = '1'
    setParticipants(rebalance([...participants, row]))
  }

  function removeParticipant(i: number) {
    // Removing a row frees its share back to the untouched rows.
    setParticipants(rebalance(participants.filter((_, idx) => idx !== i)))
  }

  function addMe() {
    if (!currentUser?.email) return
    const meLower = currentUser.email.toLowerCase()
    if (participants.some(p => p.email.toLowerCase() === meLower)) return
    const me = mkParticipant(currentUser.name, currentUser.email)
    if (splitMode === 'shares') me.shares = '1'
    setParticipants(rebalance([me, ...participants]))
  }

  function addFriendAsParticipant(friend: Friend) {
    const alreadyAdded = participants.some(p =>
      (friend.email && p.email === friend.email) || p.name.toLowerCase() === friend.name.toLowerCase()
    )
    if (alreadyAdded) { toast.error(`${friend.name} is already added`); return }
    const newRow = mkParticipant(friend.name, friend.email ?? '')
    if (splitMode === 'shares') newRow.shares = '1'
    const emptyIdx = participants.findIndex(p => !p.name && !p.email)
    const placed = emptyIdx !== -1 ? participants.map((p, i) => i === emptyIdx ? newRow : p) : [...participants, newRow]
    setParticipants(rebalance(placed))
  }

  const computedAmounts = amountsFor(splitMode, participants, total)
  const allocatedTotal = round2(computedAmounts.reduce((s, a) => s + a, 0))
  const splitDiff = round2(total - allocatedTotal)
  const percentSum = round2(participants.reduce((s, p) => s + (parseFloat(p.percent) || 0), 0))
  const sharesSum = participants.reduce((s, p) => s + (parseFloat(p.shares) || 0), 0)

  return (
    <div className="space-y-2.5 rounded-lg bg-muted/30 p-2.5">
      {/* Split-mode selector */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">How to split?</Label>
        <div className="flex items-center bg-background border rounded-lg p-0.5 text-[11px]">
          {([['equal', 'Equally'], ['percent', '%'], ['shares', 'Shares'], ['exact', 'Exact']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => changeSplitMode(m)}
              className={`flex-1 px-2 py-1 rounded-md transition-colors ${splitMode === m ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {splitMode === 'equal' && 'Divided evenly — amounts fill in automatically.'}
          {splitMode === 'percent' && 'Enter each person’s % — must total 100%.'}
          {splitMode === 'shares' && 'Enter shares (weights) — amounts scale to the total.'}
          {splitMode === 'exact' && 'Type each person’s exact amount.'}
        </p>
      </div>

      <FriendPicker
        friends={friends}
        isSelected={f => participants.some(p => (f.email && p.email === f.email) || p.name.toLowerCase() === f.name.toLowerCase())}
        onSelect={addFriendAsParticipant}
        placeholder="Search friends to add…"
      />

      <div className="space-y-2">
        {participants.map((p, i) => (
          <div key={i} className="rounded-lg border bg-background p-2.5 space-y-2 relative">
            <button
              type="button"
              onClick={() => removeParticipant(i)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-end gap-2 pr-6">
              <div className="flex-1 space-y-1 min-w-0">
                <Label className="text-xs text-muted-foreground">Name *</Label>
                <Input placeholder="Person's name" value={p.name} onChange={e => updateParticipant(i, 'name', e.target.value)} />
              </div>

              {splitMode === 'percent' && (
                <div className="w-14 space-y-1 shrink-0">
                  <Label className="text-xs text-muted-foreground">%</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0" value={p.percent} onChange={e => updateParticipant(i, 'percent', e.target.value)} />
                </div>
              )}
              {splitMode === 'shares' && (
                <div className="w-16 space-y-1 shrink-0">
                  <Label className="text-xs text-muted-foreground">Shares</Label>
                  <Input type="number" min="0" step="1" placeholder="1" value={p.shares} onChange={e => updateParticipant(i, 'shares', e.target.value)} />
                </div>
              )}

              {splitMode === 'exact' ? (
                <div className="w-24 space-y-1 shrink-0">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0" value={p.amount} onChange={e => updateExactAmount(i, e.target.value)} />
                </div>
              ) : (
                <div className="w-20 space-y-1 shrink-0">
                  <Label className="text-xs text-muted-foreground">Owes</Label>
                  <div className="h-9 flex items-center justify-end px-2 rounded-md bg-muted text-sm font-medium tabular-nums truncate">
                    {formatCurrency(computedAmounts[i] || 0)}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email <span className="text-muted-foreground/60">(optional — for notifications)</span></Label>
              <Input placeholder="email@example.com" type="email" value={p.email} onChange={e => updateParticipant(i, 'email', e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addParticipant}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add member
        </Button>
        {currentUser?.email && !participants.some(p => p.email.toLowerCase() === currentUser.email.toLowerCase()) && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMe}>
            <UserPlus className="w-3.5 h-3.5 mr-1" /> Add me
          </Button>
        )}
      </div>

      {total > 0 && (
        splitMode === 'percent' ? (
          <div className={`text-xs rounded-md px-3 py-2 ${Math.abs(percentSum - 100) < 0.01 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
            {percentSum}% of 100% · {formatCurrency(allocatedTotal)} of {formatCurrency(total)}
            {Math.abs(percentSum - 100) >= 0.01 && <span className="ml-1">({round2(100 - percentSum)}% {percentSum < 100 ? 'left' : 'over'})</span>}
          </div>
        ) : (
          <div className={`text-xs rounded-md px-3 py-2 ${Math.abs(splitDiff) < 0.01 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
            Allocated {formatCurrency(allocatedTotal)} of {formatCurrency(total)}
            {splitMode === 'shares' && sharesSum > 0 && <span className="ml-1">· {sharesSum} shares</span>}
            {Math.abs(splitDiff) >= 0.01 && <span className="ml-1">({splitDiff > 0 ? formatCurrency(splitDiff) + ' unallocated' : formatCurrency(-splitDiff) + ' over'})</span>}
          </div>
        )
      )}
    </div>
  )
}
