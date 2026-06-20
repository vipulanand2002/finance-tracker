'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, FileUp, AlertTriangle,
  ChevronDown, ChevronRight, CreditCard,
} from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import TransactionModal from './TransactionModal'
import PDFImport from './PDFImport'
import type { Transaction } from '@/types'

const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])]

interface CardInfo { id: string; name: string }

// A list item is either a plain transaction or a credit-card group header
type ListItem =
  | { kind: 'tx'; tx: Transaction }
  | { kind: 'card-group'; groupKey: string; cardId: string; cardName: string; month: string; txs: Transaction[]; latestDate: string }

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<CardInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, categoryFilter, search])

  useEffect(() => {
    fetch('/api/cards').then(r => r.json()).then(d => setCards(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = setTimeout(fetchTransactions, search ? 400 : 0)
    return () => clearTimeout(timer)
  }, [fetchTransactions, search])

  const cardNameMap = new Map(cards.map(c => [c.id, c.name]))

  // Build list items: group CC transactions by card_id + calendar month, leave rest individual
  const listItems = useCallback((): ListItem[] => {
    const groupMap = new Map<string, { cardId: string; month: string; txs: Transaction[] }>()
    const regular: Transaction[] = []

    for (const tx of transactions) {
      if (tx.card_id) {
        const month = tx.date.slice(0, 7) // YYYY-MM
        const key = `${tx.card_id}-${month}`
        if (!groupMap.has(key)) groupMap.set(key, { cardId: tx.card_id, month, txs: [] })
        groupMap.get(key)!.txs.push(tx)
      } else {
        regular.push(tx)
      }
    }

    const items: ListItem[] = []

    for (const [groupKey, { cardId, month, txs }] of groupMap) {
      items.push({
        kind: 'card-group',
        groupKey,
        cardId,
        cardName: cardNameMap.get(cardId) ?? 'Credit Card',
        month,
        txs,
        latestDate: txs.reduce((max, t) => (t.date > max ? t.date : max), txs[0].date),
      })
    }

    for (const tx of regular) {
      items.push({ kind: 'tx', tx })
    }

    // Sort by date descending (groups use their latest transaction date)
    items.sort((a, b) => {
      const dateA = a.kind === 'tx' ? a.tx.date : a.latestDate
      const dateB = b.kind === 'tx' ? b.tx.date : b.latestDate
      return dateB.localeCompare(dateA)
    })

    return items
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, cards])

  function toggleCard(groupKey: string) {
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey)
      return next
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return
    try {
      await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
      toast.success('Transaction deleted')
      fetchTransactions()
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function handleDeleteAll() {
    if (transactions.length === 0) return
    const confirmed = confirm(
      `This will permanently delete ALL ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}.\n\nThis cannot be undone. Continue?`
    )
    if (!confirmed) return
    try {
      await fetch('/api/transactions?all=true', { method: 'DELETE' })
      toast.success('All transactions deleted')
      fetchTransactions()
    } catch {
      toast.error('Failed to delete all transactions')
    }
  }

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(t: Transaction) { setEditing(t); setModalOpen(true) }

  function txAmountColor(t: Transaction) {
    if (t.category === 'Card Payment') return 'text-blue-500'
    return t.type === 'income' ? 'text-emerald-600' : 'text-red-600'
  }

  function groupStats(txs: Transaction[]) {
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const refund = txs.filter(t => t.type === 'income' && t.category !== 'Card Payment').reduce((s, t) => s + t.amount, 0)
    const payment = txs.filter(t => t.category === 'Card Payment').reduce((s, t) => s + t.amount, 0)
    return { net: refund - expense, payment }
  }

  // ── Card group row ──
  const CardGroupRow = ({ item }: { item: Extract<ListItem, { kind: 'card-group' }> }) => {
    const expanded = expandedCards.has(item.groupKey)
    const { net, payment } = groupStats(item.txs)
    const dates = item.txs.map(t => t.date).sort()
    const firstDate = format(new Date(dates[0] + 'T00:00:00'), 'dd MMM')
    const lastDate = format(new Date(dates[dates.length - 1] + 'T00:00:00'), 'dd MMM yyyy')
    const dateRange = firstDate === lastDate ? lastDate : `${firstDate} – ${lastDate}`
    const monthLabel = format(new Date(item.month + '-01'), 'MMM yyyy')

    return (
      <>
        <TableRow
          className="cursor-pointer hover:bg-muted/60 bg-muted/20 border-b-0"
          onClick={() => toggleCard(item.groupKey)}
        >
          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
            {dateRange}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2 flex-wrap">
              <CreditCard className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{item.cardName}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{monthLabel}</span>
              <Badge variant="secondary" className="text-xs">{item.txs.length} txns</Badge>
              {payment > 0 && (
                <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                  Paid {formatCurrency(payment)}
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-xs">Credit Card</Badge>
          </TableCell>
          <TableCell className="text-right">
            <span className={`font-semibold text-sm ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {net >= 0 ? '+' : ''}{formatCurrency(net)}
            </span>
          </TableCell>
          <TableCell>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </TableCell>
        </TableRow>

        {expanded && item.txs.map(t => (
          <TableRow key={t.id} className="bg-muted/5">
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap pl-6">
              {format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy')}
            </TableCell>
            <TableCell className="pl-10">
              <span className="text-sm">{t.description ?? '—'}</span>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-xs ${t.category === 'Card Payment' ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400' : ''}`}
              >
                {t.category}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <span className={`font-semibold text-sm ${txAmountColor(t)}`}>
                {t.category === 'Card Payment' ? '' : t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
              </span>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground" aria-label="Options">
                  <MoreHorizontal className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </>
    )
  }

  // ── Mobile card group row ──
  const MobileCardGroupRow = ({ item }: { item: Extract<ListItem, { kind: 'card-group' }> }) => {
    const expanded = expandedCards.has(item.groupKey)
    const { net, payment } = groupStats(item.txs)
    const monthLabel = format(new Date(item.month + '-01'), 'MMM yyyy')

    return (
      <>
        <div
          className="flex items-center justify-between p-4 border-b bg-muted/20 cursor-pointer"
          onClick={() => toggleCard(item.groupKey)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.cardName}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-muted-foreground">{monthLabel} · {item.txs.length} txns</p>
                {payment > 0 && (
                  <span className="text-xs text-blue-500">Paid {formatCurrency(payment)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span className={`text-sm font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {net >= 0 ? '+' : ''}{formatCurrency(net)}
            </span>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && item.txs.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3 border-b bg-muted/5 pl-8">
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{t.description ?? t.category}</p>
              <p className={`text-xs ${t.category === 'Card Payment' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                {t.category} · {format(new Date(t.date + 'T00:00:00'), 'dd MMM')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className={`text-sm font-semibold ${txAmountColor(t)}`}>
                {t.category === 'Card Payment' ? '' : t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors text-muted-foreground" aria-label="Options">
                  <MoreHorizontal className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </>
    )
  }

  const MobileRow = ({ t }: { t: Transaction }) => (
    <div className="flex items-center justify-between p-4 border-b last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{t.description ?? t.category}</p>
        <p className="text-xs text-muted-foreground">
          {t.category} · {format(new Date(t.date + 'T00:00:00'), 'dd MMM')}
          {t.is_recurring && <span className="ml-1 text-primary">↻</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors text-muted-foreground" aria-label="Options">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  const DesktopRow = ({ t }: { t: Transaction }) => (
    <TableRow>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy')}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm">{t.description ?? '—'}</span>
          {t.is_recurring && <Badge variant="secondary" className="text-xs">Recurring</Badge>}
        </div>
      </TableCell>
      <TableCell><Badge variant="outline" className="text-xs">{t.category}</Badge></TableCell>
      <TableCell className="text-right">
        <span className={`font-semibold text-sm ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
        </span>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground" aria-label="Options">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )

  const items = listItems()

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Select value={typeFilter} onValueChange={v => v && setTypeFilter(v)}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={v => v && setCategoryFilter(v)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPdfOpen(true)} className="shrink-0">
            <FileUp className="w-4 h-4 mr-1" /> Import PDF
          </Button>
          <Button onClick={openAdd} className="shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
          {transactions.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDeleteAll}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <AlertTriangle className="w-4 h-4 mr-1" /> Delete All
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="mb-3">No transactions found</p>
              <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add your first transaction</Button>
            </div>
          ) : (
            <>
              {/* Mobile view */}
              <div className="md:hidden">
                {items.map((item) =>
                  item.kind === 'card-group'
                    ? <MobileCardGroupRow key={item.groupKey} item={item} />
                    : <MobileRow key={item.tx.id} t={item.tx} />
                )}
              </div>

              {/* Desktop table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) =>
                    item.kind === 'card-group'
                      ? <CardGroupRow key={item.groupKey} item={item} />
                      : <DesktopRow key={item.tx.id} t={item.tx} />
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchTransactions}
        transaction={editing}
      />
      <PDFImport open={pdfOpen} onClose={() => setPdfOpen(false)} onImported={fetchTransactions} />
    </div>
  )
}
