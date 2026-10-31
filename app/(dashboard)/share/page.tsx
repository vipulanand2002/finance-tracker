'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { toast } from 'sonner'
import { format, addDays, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { parseSms, matchCard, matchAccount, type ParsedSms, type MatchableCard, type MatchableAccount, type MatchHow } from '@/lib/parse-sms'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import { ArrowDownCircle, ArrowUpCircle, Smartphone, Sparkles, Loader2, AlertTriangle, CreditCard, Wallet } from 'lucide-react'

const NONE = '__none__'

const KIND_LABEL: Record<string, string> = {
  purchase: 'Card purchase',
  refund: 'Card refund',
  card_payment: 'Card bill payment',
  debit: 'Money out',
  credit: 'Money in',
}

const HOW_LABEL: Record<Exclude<MatchHow, null>, string> = {
  last4: 'matched by last 4 digits',
  bank: 'matched by bank',
  wallet: 'matched by wallet',
}

interface AccountOption extends MatchableAccount { balance?: number }
interface ExistingTx { id: string; amount: number; date: string; description: string | null; card_id: string | null }

function ShareContent() {
  const params = useSearchParams()
  const router = useRouter()

  const rawText = params.get('text') ?? params.get('title') ?? ''
  // The Cards page passes the card you were looking at, used when the SMS doesn't say
  const hintCardId = params.get('card_id')

  const [smsText, setSmsText] = useState(rawText)
  const [parsed, setParsed] = useState<ParsedSms | null>(null)
  const [source, setSource] = useState<'rules' | 'ai'>('rules')
  const [cards, setCards] = useState<MatchableCard[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)

  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [cardId, setCardId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [cardHow, setCardHow] = useState<MatchHow>(null)
  const [accountHow, setAccountHow] = useState<MatchHow>(null)
  const [saving, setSaving] = useState(false)
  const [nearby, setNearby] = useState<ExistingTx[]>([])

  // Fill the form from a parse result, matching the message to your cards & accounts
  const apply = useCallback((p: ParsedSms, cs: MatchableCard[], as: AccountOption[], from: 'rules' | 'ai') => {
    setParsed(p)
    setSource(from)
    setAmount(p.amount != null ? String(p.amount) : '')
    setType(p.type ?? 'expense')
    setDescription(p.description)
    setCategory(p.category)
    setDate(p.date)
    const c = matchCard(p, cs)
    const hinted = !c.card && hintCardId && (p.kind === 'purchase' || p.kind === 'refund' || p.kind === 'card_payment')
      ? cs.find(x => x.id === hintCardId) ?? null : null
    setCardId(c.card?.id ?? hinted?.id ?? null)
    setCardHow(c.card ? c.how : null)
    const a = matchAccount(p, as)
    setAccountId(a.account?.id ?? null)
    setAccountHow(a.account ? a.how : null)
  }, [hintCardId])

  const askAi = useCallback(async (text: string, cs: MatchableCard[], as: AccountOption[], fallback: ParsedSms | null) => {
    setAiBusy(true)
    try {
      const res = await fetch('/api/ai/parse-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI could not read this message')
      // Keep what only the rules detect (wallet), and the raw text
      apply({ ...(fallback ?? parseSms(text)), ...data, wallet: fallback?.wallet ?? null, raw: text }, cs, as, 'ai')
      toast.success('Read with AI — check the details')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI could not read this message')
    } finally {
      setAiBusy(false)
    }
  }, [apply])

  // Load your cards & accounts, then parse whatever was shared / pasted in
  useEffect(() => {
    Promise.all([
      fetch('/api/cards').then(r => r.json()).catch(() => []),
      fetch('/api/accounts').then(r => r.json()).catch(() => ({ accounts: [] })),
    ]).then(([c, a]) => {
      const cs: MatchableCard[] = Array.isArray(c) ? c : []
      const as: AccountOption[] = Array.isArray(a?.accounts) ? a.accounts : []
      setCards(cs)
      setAccounts(as)
      setLoaded(true)
      if (!rawText.trim()) return
      const p = parseSms(rawText)
      apply(p, cs, as, 'rules')
      if (p.confidence === 'low') askAi(rawText, cs, as, p)
    })
  }, [rawText, apply, askAi])

  // Duplicate check: anything with the same amount within a day of this date
  useEffect(() => {
    if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const d = parseISO(date)
    const from = format(addDays(d, -1), 'yyyy-MM-dd')
    const to = format(addDays(d, 1), 'yyyy-MM-dd')
    let cancelled = false
    fetch(`/api/transactions?from=${from}&to=${to}`)
      .then(r => (r.ok ? r.json() : []))
      .then(rows => { if (!cancelled) setNearby(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setNearby([]) })
    return () => { cancelled = true }
  }, [parsed, date])

  const duplicate = useMemo(() => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return null
    return nearby.find(t => Math.abs(Number(t.amount) - n) < 0.01 && (!cardId || !t.card_id || t.card_id === cardId)) ?? null
  }, [nearby, amount, cardId])

  function reParse() {
    if (!smsText.trim()) return
    const p = parseSms(smsText)
    apply(p, cards, accounts, 'rules')
    if (p.confidence === 'low') askAi(smsText, cards, accounts, p)
    else toast.success('Message read')
  }

  const isCardPayment = category === 'Card Payment'
  const creditCards = cards.filter(c => (c.card_type ?? 'credit') === 'credit')
  const activeAccounts = accounts.filter(a => !a.is_archived || a.id === accountId)

  // Same rule as the Add transaction form: paid with a card OR from an account —
  // except a card bill payment, which is paid FOR a card FROM an account.
  function pickCard(id: string | null) {
    setCardId(id)
    setCardHow(null)
    if (id && !isCardPayment) { setAccountId(null); setAccountHow(null) }
  }
  function pickAccount(id: string | null) {
    setAccountId(id)
    setAccountHow(null)
    if (id && !isCardPayment) { setCardId(null); setCardHow(null) }
  }
  function pickCategory(c: string) {
    // Leaving Card Payment with both set: keep the card, drop the account
    if (isCardPayment && c !== 'Card Payment' && cardId && accountId) { setAccountId(null); setAccountHow(null) }
    setCategory(c)
  }

  async function save() {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (isCardPayment && !cardId && creditCards.length > 0) {
      toast.warning('Choose the card this payment is for')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          type,
          category: category || 'Other',
          description: description || (cardId ? 'Card purchase' : 'UPI Payment'),
          date,
          is_recurring: false,
          card_id: cardId,
          account_id: accountId,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Transaction added!')
      router.push(cardId ? '/cards' : '/transactions')
    } catch {
      toast.error('Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const categories = useMemo(() => {
    const base: string[] = type === 'income' ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES]
    return category && !base.includes(category) ? [category, ...base] : base
  }, [type, category])

  const cardLabel = (id: string | null) => {
    const c = cards.find(x => x.id === id)
    return c ? `${c.card_name}${c.last_four ? ` ••${c.last_four}` : ''}` : 'No card'
  }
  const accountLabel = (id: string | null) => {
    const a = accounts.find(x => x.id === id)
    return a ? `${a.name}${a.balance != null ? ` · ${formatCurrency(a.balance)}` : ''}` : 'None'
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold">Add from SMS</h1>
      </div>

      {/* SMS text input */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">SMS / Notification text</CardTitle>
          <CardDescription className="text-xs">Bank, credit card, wallet or UPI message — paste or edit it below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="e.g. Rs.499.00 spent on HDFC Bank Credit Card XX1234 at SWIGGY on 29-10-2026…"
            className="text-xs min-h-[80px] font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={reParse} disabled={!loaded || !smsText.trim()}>
              Read message
            </Button>
            <Button size="sm" variant="outline" onClick={() => askAi(smsText, cards, accounts, parsed)} disabled={!loaded || aiBusy || !smsText.trim()}>
              {aiBusy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              Ask AI
            </Button>
          </div>
        </CardContent>
      </Card>

      {aiBusy && !parsed && (
        <p className="text-center text-sm text-muted-foreground py-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Reading the message with AI…
        </p>
      )}

      {/* Parsed result form */}
      {parsed && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Parsed transaction</CardTitle>
              {aiBusy
                ? <Badge variant="outline" className="text-xs gap-1"><Loader2 className="w-3 h-3 animate-spin" />Asking AI…</Badge>
                : parsed.confidence === 'high'
                  ? <Badge variant="outline" className="text-xs text-green-600 border-green-500">{source === 'ai' ? 'Read with AI' : 'Auto-detected'}</Badge>
                  : <Badge variant="destructive" className="text-xs">Couldn’t read it all — check below</Badge>}
            </div>
            {/* What we understood */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {parsed.kind && <Badge variant="secondary" className="text-xs">{KIND_LABEL[parsed.kind]}</Badge>}
              {parsed.bank && <Badge variant="secondary" className="text-xs">{parsed.bank}</Badge>}
              {parsed.cardLast4 && <Badge variant="secondary" className="text-xs">Card ••{parsed.cardLast4}</Badge>}
              {parsed.accountLast4 && <Badge variant="secondary" className="text-xs">A/c ••{parsed.accountLast4}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsed.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                {parsed.warnings.map(w => <p key={w} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{w}</p>)}
              </div>
            )}

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => { setType('expense'); if (category !== 'Card Payment' && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) setCategory('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium border transition-colors ${
                  type === 'expense' ? 'bg-red-500/10 border-red-500 text-red-500' : 'border-muted text-muted-foreground'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" /> Expense
              </button>
              <button
                onClick={() => { setType('income'); if (!(INCOME_CATEGORIES as readonly string[]).includes(category)) setCategory('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium border transition-colors ${
                  type === 'income' ? 'bg-green-500/10 border-green-500 text-green-500' : 'border-muted text-muted-foreground'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" /> Income
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="text-lg font-bold" />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Merchant / purpose" />
            </div>

            {/* Category */}
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => pickCategory(v ?? '')}>
                <SelectTrigger>
                  <span className="truncate text-sm">{category || <span className="text-muted-foreground">Select category</span>}</span>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Card */}
            {creditCards.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />{isCardPayment ? 'Paid for card' : 'Paid with credit card'}
                  {cardId && cardHow && <span className="text-muted-foreground font-normal">· {HOW_LABEL[cardHow]}</span>}
                </Label>
                <Select value={cardId ?? NONE} onValueChange={(v) => pickCard(!v || v === NONE ? null : v)}>
                  <SelectTrigger><span className="truncate text-sm">{cardLabel(cardId)}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No card</SelectItem>
                    {creditCards.map(c => <SelectItem key={c.id} value={c.id}>{cardLabel(c.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {parsed.cardLast4 && !cardId && (
                  <p className="text-xs text-muted-foreground">No saved card ends in {parsed.cardLast4} — pick one, or add it on the Cards page.</p>
                )}
              </div>
            )}

            {/* Wallet / account */}
            {activeAccounts.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />{type === 'income' && !isCardPayment ? 'Received into' : 'Paid from'} wallet / account
                  {accountId && accountHow && <span className="text-muted-foreground font-normal">· {HOW_LABEL[accountHow]}</span>}
                </Label>
                <Select value={accountId ?? NONE} onValueChange={(v) => pickAccount(!v || v === NONE ? null : v)}>
                  <SelectTrigger><span className="truncate text-sm">{accountLabel(accountId)}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {duplicate && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Possible duplicate: you already have {formatCurrency(Number(duplicate.amount))}{duplicate.description ? ` “${duplicate.description}”` : ''} on {format(parseISO(duplicate.date), 'dd MMM')}. Save only if this is a different transaction.</span>
              </div>
            )}

            <Button onClick={save} disabled={saving || aiBusy} className="w-full">
              {saving ? 'Saving…' : duplicate ? 'Add anyway' : 'Add Transaction'}
            </Button>
          </CardContent>
        </Card>
      )}

      {!parsed && !aiBusy && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Paste a bank, card or UPI message above and tap Read message
        </p>
      )}
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense>
      <ShareContent />
    </Suspense>
  )
}
