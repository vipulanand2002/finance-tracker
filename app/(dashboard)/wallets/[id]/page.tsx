'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Pencil, Trash2, Archive, ArchiveRestore,
  Loader2, Receipt, ArrowLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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

export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<Activity[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [accountModal, setAccountModal] = useState(false)
  const [transfer, setTransfer] = useState<{ open: boolean; mode: TransferMode }>({ open: false, mode: 'topup' })
  const [txModal, setTxModal] = useState<{ open: boolean; type: 'income' | 'expense'; tx: Transaction | null }>({ open: false, type: 'expense', tx: null })

  const load = useCallback(() => fetch('/api/accounts')
    .then(async res => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setAccounts(Array.isArray(data.accounts) ? data.accounts : [])
    })
    .catch(() => { toast.error('Failed to load wallet') })
    .finally(() => setLoading(false)), [])

  const loadActivity = useCallback(async () => {
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
  }, [id])

  useEffect(() => { load(); Promise.resolve().then(loadActivity) }, [load, loadActivity])

  const refresh = useCallback(() => { load(); loadActivity() }, [load, loadActivity])

  const account = accounts.find(a => a.id === id) ?? null
  const active = useMemo(() => accounts.filter(a => !a.is_archived), [accounts])

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/accounts?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to update')
      }
      if (okMsg) toast.success(okMsg)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount() {
    if (!account) return
    if (!confirm(`Delete "${account.name}"? Its transfers are removed; transactions stay but are no longer linked to it.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Account deleted')
      router.push('/wallets')
    } catch {
      toast.error('Failed to delete account')
      setBusy(false)
    }
  }

  async function deleteTransfer(transferId: string) {
    if (!confirm('Delete this transfer?')) return
    const res = await fetch(`/api/account-transfers?id=${transferId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete transfer'); return }
    toast.success('Transfer deleted')
    refresh()
  }

  function transferLabel(t: AccountTransfer) {
    const name = (tid: string | null) => accounts.find(a => a.id === tid)?.name ?? 'Deleted account'
    if (!t.from_account_id) return 'Money added'
    if (!t.to_account_id) return 'Withdrawn'
    return t.to_account_id === id ? `From ${name(t.from_account_id)}` : `To ${name(t.from_account_id === id ? t.to_account_id : t.from_account_id)}`
  }

  const back = (
    <Link href="/wallets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="w-4 h-4" /> All wallets
    </Link>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-28" />
        <div className="grid lg:grid-cols-3 gap-6"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="space-y-6">
        {back}
        <Card><CardContent className="py-12 text-center text-muted-foreground">This account doesn’t exist any more.</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {back}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <AccountLogo provider={account.provider} domain={account.logo_domain} kind={account.kind} color={account.color} label={account.institution ?? account.name} size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{account.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant="secondary">{account.institution ?? getProvider(account.provider)?.label ?? KIND_LABEL[account.kind]}</Badge>
              {account.is_archived && <Badge variant="outline">Archived</Badge>}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Current balance</p>
          <p className={cn('text-3xl font-bold', account.balance < 0 && 'text-red-500')}>{formatCurrency(account.balance)}</p>
        </div>
      </div>
      {account.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{account.notes}</p>}

      {/* Actions */}
      {!account.is_archived && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setTxModal({ open: true, type: 'expense', tx: null })}><Receipt className="w-4 h-4 mr-2" /> Add expense</Button>
          <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'topup' })}><ArrowDownToLine className="w-4 h-4 mr-2" /> Add money</Button>
          <Button variant="outline" onClick={() => setTxModal({ open: true, type: 'income', tx: null })}><Plus className="w-4 h-4 mr-2" /> Add income</Button>
          {active.length >= 2 && (
            <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'move' })}><ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer</Button>
          )}
          <Button variant="outline" onClick={() => setTransfer({ open: true, mode: 'withdraw' })}><ArrowUpFromLine className="w-4 h-4 mr-2" /> Withdraw</Button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Activity */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet. Add an expense or some money to get started.</p>
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
                        <p className="text-sm font-medium truncate">{transferLabel(r.transfer)}</p>
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
          </CardContent>
        </Card>

        {/* Side column: summary, settings, manage */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Opening</p><p className="font-medium">{formatCurrency(account.opening_balance)}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Spent</p><p className="font-medium text-red-500">−{formatCurrency(account.expenses)}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Received</p><p className="font-medium text-green-600">+{formatCurrency(account.income)}</p></div>
              <div className="rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">Transfers (net)</p><p className="font-medium">{formatCurrency(account.transfersIn - account.transfersOut)}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Where it counts</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <div className="flex items-center justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Count in total balance</p>
                  <p className="text-xs text-muted-foreground">Part of your overall balance (dashboard &amp; Wallets total)</p>
                </div>
                <Switch checked={account.include_in_total !== false} disabled={busy} onCheckedChange={v => patch({ include_in_total: v })} />
              </div>
              <div className="flex items-center justify-between gap-3 pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Count in monthly spending</p>
                  <p className="text-xs text-muted-foreground">Its income &amp; expenses show in monthly totals, charts and budgets</p>
                </div>
                <Switch checked={account.include_in_spending !== false} disabled={busy} onCheckedChange={v => patch({ include_in_spending: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Manage</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setAccountModal(true)}><Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => patch({ is_archived: !account.is_archived }, account.is_archived ? 'Account restored' : 'Account archived')}>
                {account.is_archived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
                {account.is_archived ? 'Restore' : 'Archive'}
              </Button>
              <Button variant="outline" size="sm" className="text-red-500" disabled={busy} onClick={deleteAccount}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <AccountModal
        open={accountModal}
        account={account}
        onClose={() => setAccountModal(false)}
        onSaved={refresh}
      />
      <TransferModal
        open={transfer.open}
        mode={transfer.mode}
        accountId={account.id}
        accounts={accounts}
        onClose={() => setTransfer(t => ({ ...t, open: false }))}
        onSaved={refresh}
      />
      {txModal.open && (
        <TransactionModal
          open={txModal.open}
          transaction={txModal.tx}
          defaultType={txModal.type}
          defaultAccountId={account.id}
          walletMode
          onClose={() => setTxModal(t => ({ ...t, open: false, tx: null }))}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
