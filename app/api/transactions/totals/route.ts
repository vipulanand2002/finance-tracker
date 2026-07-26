import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transactions/totals — all-time net account balance
// Uses Cards-OFF logic: card purchases excluded (avoid double count with Card Payment)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category, card_id')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let totalIncome = 0
  let totalExpenses = 0

  for (const t of data ?? []) {
    // Skip card-purchased items (card_id set) unless it's a Card Payment (the actual cash outflow)
    const isCountable = !t.card_id || t.category === 'Card Payment'
    if (!isCountable) continue

    if (t.type === 'income' && t.category !== 'Card Payment') {
      totalIncome += t.amount
    } else if (t.type === 'expense' || t.category === 'Card Payment') {
      totalExpenses += t.amount
    }
  }

  return NextResponse.json({
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net_balance: totalIncome - totalExpenses,
  })
}
