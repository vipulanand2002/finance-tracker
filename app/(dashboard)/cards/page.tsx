'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { format, subMonths, startOfMonth } from 'date-fns'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, CreditCard, Pencil, Trash2, FileUp, BarChart3 } from 'lucide-react'
import CardDisplay, { type CardData } from '@/components/cards/CardDisplay'
import CardModal from '@/components/cards/CardModal'
import CardPDFImport from '@/components/cards/CardPDFImport'
import { CATEGORY_COLORS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types'

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', rupay: 'RuPay', amex: 'Amex', other: '',
}

interface CardBudget {
  id: string
  card_id: string
  category: string
  amount: number
  month: number
  year: number
}

function buildMonthOptions() {
  const now = new Date()
  const options = [{ value: 'all', label: 'All Time' }]
  for (let i = 0; i < 12; i++) {
    const d = subMonths(startOfMonth(now), i)
    options.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') })
  }
  return options
}
const MONTH_OPTIONS = buildMonthOptions()

// ── Helpers ──
function cardOutstanding(txs: Transaction[], cardId: string) {
  const ts = txs.filter(t => t.card_id === cardId)
  const spent = ts.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const paid = ts.filter(t => t.category === 'Card Payment').reduce((s, t) => s + t.amount, 0)
  return spent - paid
}

function spendByCategory(txs: Transaction[]) {
  const map = new Map<string, number>()
  for (const t of txs.filter(t => t.type === 'expense' && t.category !== 'Card Payment')) {
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

// ── Stats Strip ──
function SpendStats({ txs }: { txs: Transaction[] }) {
  const spent = txs.filter(t => t.type === 'expense' && t.category !== 'Card Payment').reduce((s, t) => s + t.amount, 0)
  const refunds = txs.filter(t => t.type === 'income' && t.category !== 'Card Payment').reduce((s, t) => s + t.amount, 0)
  const paid = txs.filter(t => t.category === 'Card Payment').reduce((s, t) => s + t.amount, 0)
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
        <p className="text-xs text-muted-foreground">Spent</p>
        <p className="text-sm font-semibold text-red-600">{formatCurrency(spent)}</p>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
        <p className="text-xs text-muted-foreground">Refunds</p>
        <p className="text-sm font-semibold text-emerald-600">{formatCurrency(refunds)}</p>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
        <p className="text-xs text-muted-foreground">Paid</p>
        <p className="text-sm font-semibold text-blue-500">{formatCurrency(paid)}</p>
      </div>
    </div>
  )
}

// ── Bar Chart View ──
function BarChartView({ txs }: { txs: Transaction[] }) {
  const cats = spendByCategory(txs)
  if (cats.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No spending data</p>
  const max = cats[0][1]
  return (
    <div className="space-y-3">
      {cats.map(([cat, amt]) => (
        <div key={cat} className="space-y-1">
          <div className="flex justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#94a3b8' }} />
              <span className="text-muted-foreground">{cat}</span>
            </div>
            <span className="font-medium">{formatCurrency(amt)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(amt / max) * 100}%`, backgroundColor: CATEGORY_COLORS[cat] ?? '#94a3b8' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Donut Chart View ──
function DonutChartView({ txs }: { txs: Transaction[] }) {
  const cats = spendByCategory(txs)
  if (cats.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No spending data</p>
  const data = cats.map(([name, value]) => ({ name, value }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
          ))}
        </Pie>
        <RechartsTooltip
          formatter={(val) => [formatCurrency(Number(val) || 0), '']}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <RechartsLegend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  )
}

// ── Budget Section ──
function BudgetSection({
  txs,
  budgets,
  onSave,
  onDelete,
  canEdit,
}: {
  txs: Transaction[]
  budgets: CardBudget[]
  onSave: (category: string, amount: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
  canEdit: boolean
}) {
  const cats = spendByCategory(txs)
  // Merge: categories from spending + categories that have budgets
  const budgetCatSet = new Set(budgets.map(b => b.category))
  const allCats = [...new Set([...cats.map(([c]) => c), ...budgetCatSet])]

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const prevRef = useRef<Record<string, string>>({})

  // Sync inputs when budgets change
  useEffect(() => {
    const init: Record<string, string> = {}
    for (const b of budgets) init[b.category] = String(b.amount)
    setInputs(init)
    prevRef.current = init
  }, [budgets])

  async function handleBlur(cat: string) {
    const val = inputs[cat]?.trim()
    const prev = prevRef.current[cat] ?? ''
    if (val === prev) return

    const existing = budgets.find(b => b.category === cat)

    if (!val || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
      if (existing) {
        setSaving(s => ({ ...s, [cat]: true }))
        await onDelete(existing.id)
        setSaving(s => ({ ...s, [cat]: false }))
        prevRef.current[cat] = ''
      }
      setInputs(i => ({ ...i, [cat]: '' }))
      return
    }

    setSaving(s => ({ ...s, [cat]: true }))
    await onSave(cat, parseFloat(val))
    setSaving(s => ({ ...s, [cat]: false }))
    prevRef.current[cat] = val
  }

  if (allCats.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No spending data for this period</p>
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-center">
          Select a specific card and month above to set budgets
        </p>
      )}
      {allCats.map(cat => {
        const spent = cats.find(([c]) => c === cat)?.[1] ?? 0
        const budget = budgets.find(b => b.category === cat)
        const budgetAmt = budget?.amount ?? 0
        const pct = budgetAmt > 0 ? (spent / budgetAmt) * 100 : 0
        const over = budgetAmt > 0 && spent > budgetAmt

        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#94a3b8' }}
              />
              <span className="text-sm flex-1 min-w-0 truncate">{cat}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(spent)}</span>
              {canEdit ? (
                <div className="relative shrink-0">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Budget"
                    value={inputs[cat] ?? ''}
                    onChange={e => setInputs(i => ({ ...i, [cat]: e.target.value }))}
                    onBlur={() => handleBlur(cat)}
                    className="w-24 h-7 text-xs pr-1"
                    disabled={saving[cat]}
                  />
                  {saving[cat] && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">…</span>
                  )}
                </div>
              ) : (
                budgetAmt > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">/ {formatCurrency(budgetAmt)}</span>
                )
              )}
              {over && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Over</Badge>}
            </div>
            {budgetAmt > 0 && (
              <div className="pl-4">
                <Progress
                  value={Math.min(pct, 100)}
                  className={
                    over
                      ? '[&>div]:bg-red-500'
                      : pct > 80
                      ? '[&>div]:bg-amber-500'
                      : '[&>div]:bg-emerald-500'
                  }
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {over
                    ? `${formatCurrency(spent - budgetAmt)} over`
                    : `${formatCurrency(budgetAmt - spent)} remaining`}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Page ──
export default function CardsPage() {
  const [cards, setCards] = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editCard, setEditCard] = useState<CardData | null>(null)
  const [pdfCard, setPdfCard] = useState<CardData | null>(null)

  const [selectedCardId, setSelectedCardId] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'bars' | 'donut'>('bars')

  const [cardTxs, setCardTxs] = useState<Transaction[]>([])
  const [allCardTxs, setAllCardTxs] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [budgets, setBudgets] = useState<CardBudget[]>([])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cards')
      const data = await res.json()
      setCards(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCardTxs = useCallback(async (cardId: string) => {
    setTxLoading(true)
    try {
      const url = cardId === 'all'
        ? '/api/transactions?has_card=true'
        : `/api/transactions?card_id=${cardId}`
      const data = await fetch(url).then(r => r.json())
      setCardTxs(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load card transactions')
    } finally {
      setTxLoading(false)
    }
  }, [])

  const fetchBudgets = useCallback(async (cardId: string, monthStr: string) => {
    if (cardId === 'all' || monthStr === 'all') { setBudgets([]); return }
    const [year, month] = monthStr.split('-')
    try {
      const data = await fetch(`/api/card-budgets?card_id=${cardId}&month=${month}&year=${year}`).then(r => r.json())
      setBudgets(Array.isArray(data) ? data : [])
    } catch {
      setBudgets([])
    }
  }, [])

  useEffect(() => { fetchCards() }, [fetchCards])

  useEffect(() => {
    if (!loading && cards.length > 0) {
      fetchCardTxs(selectedCardId)
      // Always keep a full all-card snapshot for outstanding balance display
      fetch('/api/transactions?has_card=true')
        .then(r => r.json())
        .then(d => setAllCardTxs(Array.isArray(d) ? d : []))
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, selectedCardId])

  useEffect(() => {
    fetchBudgets(selectedCardId, selectedMonth)
  }, [fetchBudgets, selectedCardId, selectedMonth])

  const filteredTxs = useMemo(() => {
    if (selectedMonth === 'all') return cardTxs
    return cardTxs.filter(t => t.date.startsWith(selectedMonth))
  }, [cardTxs, selectedMonth])

  async function saveBudget(category: string, amount: number) {
    if (selectedCardId === 'all' || selectedMonth === 'all') return
    const [year, month] = selectedMonth.split('-')
    try {
      await fetch('/api/card-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: selectedCardId, category, amount, month: parseInt(month), year: parseInt(year) }),
      })
      await fetchBudgets(selectedCardId, selectedMonth)
    } catch {
      toast.error('Failed to save budget')
    }
  }

  async function deleteBudget(id: string) {
    try {
      await fetch(`/api/card-budgets?id=${id}`, { method: 'DELETE' })
      await fetchBudgets(selectedCardId, selectedMonth)
    } catch {
      toast.error('Failed to delete budget')
    }
  }

  async function deleteCard(id: string) {
    if (!confirm('Remove this card?')) return
    try {
      await fetch(`/api/cards?id=${id}`, { method: 'DELETE' })
      toast.success('Card removed')
      fetchCards()
    } catch {
      toast.error('Failed to remove card')
    }
  }

  const canEditBudgets = selectedCardId !== 'all' && selectedMonth !== 'all'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cards</h1>
          <p className="text-muted-foreground text-sm">Manage your credit and debit cards</p>
        </div>
        <Button onClick={() => { setEditCard(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4 mr-1" /> Add Card
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="py-20 flex flex-col items-center text-center gap-3">
            <CreditCard className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-medium">No cards yet</p>
              <p className="text-sm text-muted-foreground">Add your credit or debit cards to manage them here</p>
            </div>
            <Button onClick={() => { setEditCard(null); setModalOpen(true) }}>
              <Plus className="w-4 h-4 mr-1" /> Add your first card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map(card => (
              <div key={card.id} className="space-y-3">
                <CardDisplay card={card} />
                <div className="flex items-center justify-between px-1">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">{card.card_name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{card.card_type}</Badge>
                      {card.network !== 'other' && (
                        <Badge variant="secondary" className="text-xs">{NETWORK_LABEL[card.network]}</Badge>
                      )}
                    </div>
                    {(() => {
                      const outstanding = cardOutstanding(allCardTxs, card.id)
                      return outstanding > 0 ? (
                        <p className="text-xs font-medium text-red-500">
                          Due: {formatCurrency(outstanding)}
                        </p>
                      ) : allCardTxs.some(t => t.card_id === card.id) ? (
                        <p className="text-xs font-medium text-emerald-600">Fully paid</p>
                      ) : null
                    })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary"
                      title="Import PDF statement" onClick={() => setPdfCard(card)}>
                      <FileUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8" title="Edit card"
                      onClick={() => { setEditCard(card); setModalOpen(true) }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive"
                      title="Remove card" onClick={() => deleteCard(card.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Spending Analytics */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Spending Analytics</CardTitle>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedCardId} onValueChange={v => v && setSelectedCardId(v)}>
                    <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cards</SelectItem>
                      {cards.map(card => (
                        <SelectItem key={card.id} value={card.id}>{card.card_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedMonth} onValueChange={v => v && setSelectedMonth(v)}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {txLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <SpendStats txs={filteredTxs} />

                  {/* Chart section */}
                  <div>
                    {/* Chart toggle */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category Breakdown</p>
                      <div className="flex rounded-md border overflow-hidden text-xs">
                        <button
                          className={`px-3 py-1.5 transition-colors ${viewMode === 'bars' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                          onClick={() => setViewMode('bars')}
                        >
                          Bars
                        </button>
                        <button
                          className={`px-3 py-1.5 border-l transition-colors ${viewMode === 'donut' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                          onClick={() => setViewMode('donut')}
                        >
                          Donut
                        </button>
                      </div>
                    </div>

                    {viewMode === 'bars' ? (
                      <BarChartView txs={filteredTxs} />
                    ) : (
                      <DonutChartView txs={filteredTxs} />
                    )}
                  </div>

                  {/* Budget section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category Budgets</p>
                      {canEditBudgets && (
                        <p className="text-[10px] text-muted-foreground">Click the input to set a budget</p>
                      )}
                    </div>
                    <BudgetSection
                      txs={filteredTxs}
                      budgets={budgets}
                      onSave={saveBudget}
                      onDelete={deleteBudget}
                      canEdit={canEditBudgets}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <CardModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditCard(null) }}
        onSaved={fetchCards}
        card={editCard}
      />
      <CardPDFImport
        open={Boolean(pdfCard)}
        onClose={() => setPdfCard(null)}
        onImported={fetchCards}
        cardId={pdfCard?.id}
        cardName={pdfCard?.card_name}
        savedPassword={pdfCard?.pdf_password}
      />
    </div>
  )
}
