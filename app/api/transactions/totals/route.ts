import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transactions/totals — all-time net account balance
// Uses Cards-OFF logic: card purchases excluded (avoid double count with Card Payment)
// Transactions on a wallet/account switched off for "total balance" are excluded too.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  type Row = { amount: number; type: string; category: string; card_id: string | null; account_id?: string | null }
  let rows: Row[] | null = null
  const withAccount = await supabase.from('transactions').select('amount, type, category, card_id, account_id').eq('user_id', user.id)
  if (!withAccount.error) {
    rows = withAccount.data as Row[]
  } else {
    // account_id not migrated yet (046) — plain totals
    const plain = await supabase.from('transactions').select('amount, type, category, card_id').eq('user_id', user.id)
    if (plain.error) return NextResponse.json({ error: plain.error.message }, { status: 500 })
    rows = plain.data as Row[]
  }

  // Accounts switched off for the total balance (migration 048); none if not migrated
  const { data: accs } = await supabase.from('accounts').select('id, include_in_total').eq('user_id', user.id)
  const excluded = new Set((accs ?? []).filter((a: { include_in_total: boolean }) => a.include_in_total === false).map((a: { id: string }) => a.id))

  let totalIncome = 0
  let totalExpenses = 0

  for (const t of rows ?? []) {
    if (t.account_id && excluded.has(t.account_id)) continue

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
