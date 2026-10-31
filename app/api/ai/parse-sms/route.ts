import { createClient } from '@/lib/supabase/server'
import { geminiText } from '@/lib/ai'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { parseSmsDate } from '@/lib/parse-sms'

export const maxDuration = 30

const KINDS = ['purchase', 'refund', 'card_payment', 'debit', 'credit'] as const
const INSTRUMENTS = ['credit_card', 'debit_card', 'card', 'account', 'wallet', 'upi'] as const
const CATEGORIES = [...new Set<string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])]

// POST /api/ai/parse-sms  { text } — AI fallback for a pasted bank / card / wallet
// message the rule-based parser (lib/parse-sms.ts) couldn't make sense of. Returns the
// same fields as ParsedSms; every value is checked before it's returned.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json().catch(() => ({ text: '' }))
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 })
  const sms = text.slice(0, 2000)

  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You read Indian bank, credit card, wallet and UPI SMS messages and extract the transaction. Today is ${today}.

Return ONLY a JSON object with:
- amount: number — the transaction amount in INR. NEVER the available limit, available balance, total due or minimum due.
- kind: one of ${KINDS.map(k => `"${k}"`).join(', ')}:
    purchase = money spent on a card · refund = refund/reversal/cashback credited to a card ·
    card_payment = paying a credit card's bill (payment received on the card, or debited from a bank account towards a card, or paid via CRED) ·
    debit = money out of a bank account / wallet / UPI · credit = money into a bank account / wallet
- instrument: one of ${INSTRUMENTS.map(k => `"${k}"`).join(', ')}, or null
- merchant: string or null (who was paid / who paid; null for a card bill payment)
- category: one of ${CATEGORIES.map(c => `"${c}"`).join(', ')}
- date: "YYYY-MM-DD" (Indian dates are day-first), or null if the message has none
- card_last4: last 4 digits of the card, or null
- account_last4: last 4 digits of the bank account, or null
- bank: the bank or card issuer, short (e.g. "HDFC", "ICICI", "SBI"), or null
- warning: null, or a short sentence if this is NOT a completed transaction (OTP, declined/failed, bill or statement reminder, promotional)

SMS:
"""${sms}"""`

  try {
    const out = await geminiText(prompt, 0)
    const j = JSON.parse(out.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

    const amount = typeof j.amount === 'number' && j.amount > 0 ? Math.round(j.amount * 100) / 100 : null
    const kind = KINDS.includes(j.kind) ? j.kind as typeof KINDS[number] : null
    const instrument = INSTRUMENTS.includes(j.instrument) ? j.instrument : null
    const type = kind === 'refund' || kind === 'credit' ? 'income' : kind ? 'expense' : null
    const last4 = (v: unknown) => (typeof v === 'string' && /^\d{4}$/.test(v) ? v : null)
    const merchant = typeof j.merchant === 'string' ? j.merchant.trim().slice(0, 60) : ''
    const category = kind === 'card_payment' ? 'Card Payment'
      : kind === 'refund' ? 'Refund'
      : CATEGORIES.includes(j.category) ? j.category : 'Other'
    const date = typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : parseSmsDate(sms)
    const bank = typeof j.bank === 'string' && j.bank.trim() ? j.bank.trim().slice(0, 30) : null
    const cardLast4 = last4(j.card_last4)

    return NextResponse.json({
      amount, kind, type, instrument, category, date, bank, cardLast4,
      accountLast4: last4(j.account_last4),
      description: kind === 'card_payment'
        ? `Card bill payment${bank ? ` · ${bank}` : ''}${cardLast4 ? ` ••${cardLast4}` : ''}`
        : merchant || (kind === 'refund' ? 'Card refund' : kind === 'purchase' ? 'Card purchase' : 'Transaction'),
      warnings: typeof j.warning === 'string' && j.warning.trim() ? [j.warning.trim().slice(0, 160)] : [],
      confidence: amount != null && type != null ? 'high' : 'low',
    })
  } catch (err) {
    console.error('[AI] parse-sms failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'AI could not read this message' }, { status: 502 })
  }
}
