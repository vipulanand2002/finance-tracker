'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, ArrowLeftRight, Wallet, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import AccountLogo from '@/components/wallets/AccountLogo'
import AccountModal from '@/components/wallets/AccountModal'
import TransferModal, { type TransferMode } from '@/components/wallets/TransferModal'
import { formatCurrency, cn } from '@/lib/utils'
import { KIND_LABEL, getProvider, type AccountWithBalance } from '@/lib/wallet-providers'

export default function WalletsPage() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  const [accountModal, setAccountModal] = useState<{ open: boolean; account: AccountWithBalance | null }>({ open: false, account: null })
  const [transfer, setTransfer] = useState<{ open: boolean; mode: TransferMode; accountId: string | null }>({ open: false, mode: 'topup', accountId: null })


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

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => accounts.filter(a => showArchived || !a.is_archived), [accounts, showArchived])
  const active = useMemo(() => accounts.filter(a => !a.is_archived), [accounts])
  // Accounts switched off for "total balance" are shown but not summed
  const counted = active.filter(a => a.include_in_total !== false)
  const total = counted.reduce((s, a) => s + a.balance, 0)
  const walletTotal = counted.filter(a => a.kind === 'wallet').reduce((s, a) => s + a.balance, 0)
  const notCounted = active.length - counted.length
  const archivedCount = accounts.length - active.length

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
                <p className="text-xs text-muted-foreground">
                  {counted.length} counted{notCounted > 0 ? ` · ${notCounted} left out` : ''}
                </p>
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
              <Link
                key={a.id}
                href={`/wallets/${a.id}`}
                className={cn('block text-left rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors', a.is_archived && 'opacity-60')}
                style={{ borderLeftWidth: 4, borderLeftColor: a.color ?? getProvider(a.provider)?.color ?? undefined }}
              >
                <div className="flex items-center gap-3">
                  <AccountLogo provider={a.provider} domain={a.logo_domain} kind={a.kind} color={a.color} label={a.institution ?? a.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.institution ?? getProvider(a.provider)?.label ?? KIND_LABEL[a.kind]}
                      {a.is_archived && ' · Archived'}
                      {a.include_in_total === false && ' · Not in total'}
                      {a.include_in_spending === false && ' · Not in spending'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <p className={cn('mt-3 text-xl font-semibold', a.balance < 0 && 'text-red-500')}>{formatCurrency(a.balance)}</p>
                <p className="text-xs text-muted-foreground">
                  {a.transactionCount} transaction{a.transactionCount === 1 ? '' : 's'}
                  {a.expenses > 0 && ` · ${formatCurrency(a.expenses, true)} spent`}
                </p>
              </Link>
            ))}
          </div>

          {archivedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </Button>
          )}
        </>
      )}

      <AccountModal
        open={accountModal.open}
        account={accountModal.account}
        onClose={() => setAccountModal({ open: false, account: null })}
        onSaved={load}
      />
      <TransferModal
        open={transfer.open}
        mode={transfer.mode}
        accountId={null}
        accounts={accounts}
        onClose={() => setTransfer(t => ({ ...t, open: false }))}
        onSaved={load}
      />
    </div>
  )
}
