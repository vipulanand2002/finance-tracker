import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear

  // Get all recurring transactions from last month
  const lastMonthStr = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`
  const { data: recurringTx } = await supabase
    .from('transactions')
    .select('*')
    .eq('is_recurring', true)
    .gte('date', `${lastMonthStr}-01`)
    .lte('date', `${lastMonthStr}-31`)

  if (!recurringTx?.length) {
    return NextResponse.json({ message: 'No recurring transactions found', created: 0 })
  }

  // Create copies for current month
  const inserts = recurringTx.map(t => ({
    user_id: t.user_id,
    amount: t.amount,
    type: t.type,
    category: t.category,
    description: t.description,
    date: t.date.replace(lastMonthStr, `${currentYear}-${String(currentMonth).padStart(2, '0')}`),
    is_recurring: true,
    receipt_url: null,
  }))

  const { error } = await supabase.from('transactions').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message: 'Recurring transactions created', created: inserts.length })
}
