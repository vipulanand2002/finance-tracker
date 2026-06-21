'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { parseUpiSms } from '@/lib/parse-upi'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { ArrowDownCircle, ArrowUpCircle, Smartphone } from 'lucide-react'

function ShareContent() {
  const params = useSearchParams()
  const router = useRouter()

  const rawText = params.get('text') ?? params.get('title') ?? ''

  const [smsText, setSmsText] = useState(rawText)
  const [parsed, setParsed] = useState(() => rawText ? parseUpiSms(rawText) : null)
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (parsed) {
      setAmount(parsed.amount != null ? String(parsed.amount) : '')
      setType(parsed.type ?? 'expense')
      setDescription(parsed.description)
      setCategory(parsed.category)
      setDate(parsed.date)
    }
  }, [parsed])

  function reParse() {
    if (!smsText.trim()) return
    const p = parseUpiSms(smsText)
    setParsed(p)
    toast.success('SMS parsed')
  }

  async function save() {
    if (!amount || isNaN(Number(amount))) {
      toast.error('Enter a valid amount')
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
          description: description || 'UPI Payment',
          date,
          is_recurring: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Transaction added!')
      router.push('/transactions')
    } catch {
      toast.error('Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

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
          <CardDescription className="text-xs">Paste or edit your UPI SMS below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="Paste UPI SMS here…"
            className="text-xs min-h-[80px] font-mono"
          />
          <Button size="sm" variant="outline" onClick={reParse} className="w-full">
            Parse SMS
          </Button>
        </CardContent>
      </Card>

      {/* Parsed result form */}
      {parsed && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Parsed transaction</CardTitle>
              {parsed.amount != null
                ? <Badge variant="outline" className="text-xs text-green-500 border-green-500">Auto-detected</Badge>
                : <Badge variant="destructive" className="text-xs">Could not parse</Badge>
              }
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => { setType('expense'); setCategory('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium border transition-colors ${
                  type === 'expense'
                    ? 'bg-red-500/10 border-red-500 text-red-500'
                    : 'border-muted text-muted-foreground'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" /> Expense
              </button>
              <button
                onClick={() => { setType('income'); setCategory('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium border transition-colors ${
                  type === 'income'
                    ? 'bg-green-500/10 border-green-500 text-green-500'
                    : 'border-muted text-muted-foreground'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" /> Income
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-lg font-bold"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Merchant / purpose"
              />
            </div>

            {/* Category */}
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Add Transaction'}
            </Button>
          </CardContent>
        </Card>
      )}

      {!parsed && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Paste a UPI SMS above and tap Parse SMS
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
