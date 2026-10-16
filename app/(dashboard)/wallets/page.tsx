'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Pencil, Trash2, Archive, ArchiveRestore,
  Wallet, ChevronRight, Loader2, Receipt,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import AccountLogo from '@/components/wallets/AccountLogo'
import AccountModal from '@/components/wallets/AccountModal'
import TransferModal, { type TransferMode } from '@/components/wallets/TransferModal'
import { formatCurrency, cn } from '@/lib/utils'
import { KIND_LABEL, getProvider, type AccountWithBalance, type AccountTransfer } from '@/lib/wallet-providers'
import type { Transaction } from '@/types'

const TransactionModal = dynamic(() => import('@/components/transactions/TransactionModal'), { ssr: false })

// One line in an account's activity: a transaction or a transfer
type Activity =
  | { kind: 'tx'; id: string; date: string; created: string; amount: number; tx: Transaction }
  | { kind: 'transfer'; id: string; date: string; created: string; amount: number; transfer: AccountTransfer }

export default function WalletsPage() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  const [accountModal, setAccountModal] = useState<{ open: boolean; account: AccountWithBalance | null }>({ open: false, account: null })
  const [transfer, setTransfer] = useState<{ open: boolean; mode: TransferMode; accountId: string | null }>({ open: false, mode: 'topup', accountId: null })
  const [txModal, setTxModal] = useState<{ open: boolean; type: 'income' | 'expense'; tx: Transaction | null }>({ open: false, type: 'expense', tx: null })

  const [detailId, setDetailId] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  // State is only set in promise callbacks, so this is safe to call from an effect
  const load = useCallback(() => fetch('/api/accounts')
    .then(async res => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setAvailable(data.available !== false)
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    })
    .catch(() => { toast.error('Failed to load wallets') })
    .finally(() => setLoading(false)), [])

  const loadActivity = useCallback(async (id: string) => {
    setActivityLoading(true)
    try {
      const [txRes, trRes] = await Promise.all([
        fetch(`/api/transactions?account_id=${id}`),
        fetch(`/api/account-transfers?account_id=${id}`),
      ])
      const txs: Transaction[] = txRes.ok ? await txRes.json() : []
      const trs: AccountTransfer[] = trRes.ok ? await trRes.json() : []
      const rows: Activity[] = [
        ...(Array.isArray(txs) ? txs : []).map(t => ({ kind: 'tx' as const, id: t.id, date: t.date, created: t.created_at, amount: t.type === 'income' ? t.amount : -t.amount, tx: t })),
        ...(Array.isArray(trs) ? trs : []).map(t => ({ kind: 'transfer' as const, id: t.id, date: t.date, created: t.created_at, amount: t.to_account_id === id ? Number(t.amount) : -Number(t.amount), transfer: t })),
      ]
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created))
      setActivity(rows)
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openDetail(id: string) {
    setDetailId(id)
    setActivity([])
    loadActivity(id)
  }

  const refresh = useCallback(() => {
    load()
    if (detailId) loadActivity(detailId)
  }, [load, loadActivity, detailId])

  const visible = useMemo(() => accounts.filter(a => showArchived || !a.is_archived), [accounts, showArchived])
  const active = useMemo(() => accounts.filter(a => !a.is_archived), [accounts])
  const total = active.reduce((s, a) => s + a.balance, 0)
  const walletTotal = active.filter(a => a.kind === 'wallet').reduce((s, a) => s + a.balance, 0)
  const archivedCount = accounts.length - active.length
  const detail = accounts.find(a => a.id === detailId) ?? null

  async function setArchived(a: AccountWithBalance, archived: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/accounts?id=${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: archived }),
      })
      if (!res.ok) throw new Error()
      toast.success(archived ? 'Account archived' : 'Account restored')
      load()
    } catch {
      toast.error('Failed to update account')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount(a: AccountWithBalance) {
    if (!confirm(`Delete "${a.name}"? Its transfers are removed; transactions stay but are no longer linked to it.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/accounts?id=${a.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Account deleted')
      setDetailId(null)
      load()
    } catch {
      toast.error('Failed to delete account')
    } finally {
      setBusy(false)
    }
  }

  async function deleteTransfer(id: string) {
    if (!confirm('Delete this transfer?')) return
    const res = await fetch(`/api/account-transfers?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete transfer'); return }
    toast.success('Transfer deleted')
    refresh()
  }

  function transferLabel(t: AccountTransfer, viewingId: string) {
    const name = (id: string | null) => accounts.find(a => a.id === id)?.name ?? 'Deleted account'
    if (!t.from_account_id) return 'Money added'
    if (!t.to_account_id) return 'Withdrawn'
    return t.to_account_id === viewingId ? `From ${name(t.from_account_id)}` : `To ${name(t.to_account_id)}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wallets & Accounts</h1>
          <p className="text-muted-foreground text-sm">Amazon Pay, MobiKwik, Paytm, bank accounts, cash — and what’s in each</p>
        </div>
        {available && (
          <div className="flex items-center gap-2 flex-wrap">
            {active.length >= 2 && (
              <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'move', accountId: null })}>
                <ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer
              </Button>
            )}
            <Button onClick={() => setAccountModal({ open: true, account: null })}>
              <Plus className="w-4 h-4 mr-2" /> Add account
            </Button>
          </div>
        )}
      </div>

      {!available ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Wallet className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Wallets aren’t set up on the database yet</p>
            <p className="text-sm text-muted-foreground">Run migration <code>046_accounts_wallets.sql</code> in Supabase, then reload this page.</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Wallet className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-medium">No wallets or accounts yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add your Amazon Pay, MobiKwik or Paytm balance, a bank account or cash, then pick it when you record an expense to keep the balance up to date.
            </p>
            <Button onClick={() => setAccountModal({ open: true, account: null })}>
              <Plus className="w-4 h-4 mr-2" /> Add your first account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Total across accounts</p>
                <p className={cn('text-2xl font-bold', total < 0 && 'text-red-500')}>{formatCurrency(total)}</p>
                <p className="text-xs text-muted-foreground">{active.length} active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">In wallets</p>
                <p className={cn('text-2xl font-bold', walletTotal < 0 && 'text-red-500')}>{formatCurrency(walletTotal)}</p>
                <p className="text-xs text-muted-foreground">{active.filter(a => a.kind === 'wallet').length} wallets</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => openDetail(a.id)}
                className={cn('text-left rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors', a.is_archived && 'opacity-60')}
                style={{ borderLeftWidth: 4, borderLeftColor: a.color ?? getProvider(a.provider)?.color ?? undefined }}
              >
                <div className="flex items-center gap-3">
                  <AccountLogo provider={a.provider} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getProvider(a.provider)?.label ?? KIND_LABEL[a.kind]}
                      {a.is_archived && ' · Archived'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <p className={cn('mt-3 text-xl font-semibold', a.balance < 0 && 'text-red-500')}>{formatCurrency(a.balance)}</p>
                <p className="text-xs text-muted-foreground">
                  {a.transactionCount} transaction{a.transactionCount === 1 ? '' : 's'}
                  {a.expenses > 0 && ` · ${formatCurrency(a.expenses, true)} spent`}
                </p>
              </button>
            ))}
          </div>

          {archivedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </Button>
          )}
        </>
      )}

      {/* Account detail */}
      <Sheet open={!!detail} onOpenChange={v => { if (!v) setDetailId(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <AccountLogo provider={detail.provider} size={32} />
                  <span className="truncate">{detail.name}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-5">
                <div>
                  <p className={cn('text-3xl font-bold', detail.balance < 0 && 'text-red-500')}>{formatCurrency(detail.balance)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="secondary">{getProvider(detail.provider)?.label ?? KIND_LABEL[detail.kind]}</Badge>
                    {detail.is_archived && <Badge variant="outline">Archived</Badge>}
                  </div>
                  {detail.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{detail.notes}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Opening</p><p className="font-medium">{formatCurrency(detail.opening_balance)}</p></div>
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Spent</p><p className="font-medium text-red-500">−{formatCurrency(detail.expenses)}</p></div>
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Received</p><p className="font-medium text-green-600">+{formatCurrency(detail.income)}</p></div>
                  <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Transfers (net)</p><p className="font-medium">{formatCurrency(detail.transfersIn - detail.transfersOut)}</p></div>
                </div>

                {!detail.is_archived && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => setTxModal({ open: true, type: 'expense', tx: null })}><Receipt className="w-4 h-4 mr-2" /> Add expense</Button>
                    <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'topup', accountId: detail.id })}><ArrowDownToLine className="w-4 h-4 mr-2" /> Add money</Button>
                    <Button variant="outline" onClick={() => setTxModal({ open: true, type: 'income', tx: null })}><Plus className="w-4 h-4 mr-2" /> Add income</Button>
                    {active.length >= 2
                      ? <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'move', accountId: detail.id })}><ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer</Button>
                      : <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'withdraw', accountId: detail.id })}><ArrowUpFromLine className="w-4 h-4 mr-2" /> Withdraw</Button>}
                    {active.length >= 2 && (
                      <Button variant="outline" className="col-span-2" onClick={() => setTransfer({ open: true, mode: 'withdraw', accountId: detail.id })}><ArrowUpFromLine className="w-4 h-4 mr-2" /> Withdraw</Button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Activity</h3>
                  {activityLoading ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                  ) : activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing recorded yet. Pick this account when you add an expense, or add money to it.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {activity.map(r => (
                        <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-3 py-2.5">
                          {r.kind === 'tx' ? (
                            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setTxModal({ open: true, type: r.tx.type, tx: r.tx })}>
                              <p className="text-sm font-medium truncate">{r.tx.description || r.tx.category}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(r.date + 'T00:00:00'), 'dd MMM yyyy')} · {r.tx.category}</p>
                            </button>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{transferLabel(r.transfer, detail.id)}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {format(new Date(r.date + 'T00:00:00'), 'dd MMM yyyy')} · Transfer{r.transfer.note ? ` · ${r.transfer.note}` : ''}
                              </p>
                            </div>
                          )}
                          <span className={cn('text-sm font-semibold shrink-0', r.amount < 0 ? 'text-red-500' : 'text-green-600')}>
                            {r.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(r.amount))}
                          </span>
                          {r.kind === 'transfer' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteTransfer(r.id)} aria-label="Delete transfer">
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAccountModal({ open: true, account: detail })}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setArchived(detail, !detail.is_archived)}>
                    {detail.is_archived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
                    {detail.is_archived ? 'Restore' : 'Archive'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500" disabled={busy} onClick={() => deleteAccount(detail)}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AccountModal
        open={accountModal.open}
        account={accountModal.account}
        onClose={() => setAccountModal({ open: false, account: null })}
        onSaved={refresh}
      />
      <TransferModal
        open={transfer.open}
        mode={transfer.mode}
        accountId={transfer.accountId}
        accounts={accounts}
        onClose={() => setTransfer(t => ({ ...t, open: false }))}
        onSaved={refresh}
      />
      {txModal.open && (
        <TransactionModal
          open={txModal.open}
          transaction={txModal.tx}
          defaultType={txModal.type}
          defaultAccountId={detailId}
          onClose={() => setTxModal(t => ({ ...t, open: false, tx: null }))}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
