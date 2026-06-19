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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, FileUp, AlertTriangle } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import TransactionModal from './TransactionModal'
import PDFImport from './PDFImport'
import type { Transaction } from '@/types'

// Deduplicated category list for the filter dropdown
const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])]

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

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
    const timer = setTimeout(fetchTransactions, search ? 400 : 0)
    return () => clearTimeout(timer)
  }, [fetchTransactions, search])

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
      `This will permanently delete ALL ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}${typeFilter !== 'all' || categoryFilter !== 'all' || search ? ' (note: only visible transactions are shown but ALL transactions will be deleted)' : ''}.\n\nThis cannot be undone. Continue?`
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
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="mb-3">No transactions found</p>
              <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add your first transaction</Button>
            </div>
          ) : (
            <>
              {/* Mobile view */}
              <div className="md:hidden">
                {transactions.map(t => <MobileRow key={t.id} t={t} />)}
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
                  {transactions.map(t => <DesktopRow key={t.id} t={t} />)}
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
