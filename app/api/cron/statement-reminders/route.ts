import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Current time in IST (UTC+5:30)
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const todayDay = now.getUTCDate()

  const { data: cards } = await supabase
    .from('cards')
    .select('id, card_name, bank_name, user_id, statement_day')
    .not('statement_day', 'is', null)

  if (!cards?.length) return NextResponse.json({ sent: 0 })

  let sent = 0

  for (const card of cards) {
    const sDay = card.statement_day as number

    // Find the most recent statement date (handles month boundary)
    const stmtDate = new Date(now)
    stmtDate.setUTCDate(sDay)
    if (sDay > todayDay) {
      stmtDate.setUTCMonth(stmtDate.getUTCMonth() - 1)
    }

    const diffDays = Math.floor((now.getTime() - stmtDate.getTime()) / 86400000)

    // Only notify within the 5-day window after statement date
    if (diffDays < 0 || diffDays >= 5) continue

    // Skip if statement was already imported since the statement date
    const stmtDateStr = stmtDate.toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from('card_statements')
      .select('id')
      .eq('card_id', card.id)
      .gte('imported_at', stmtDateStr)
      .limit(1)

    if (existing?.length) continue

    await sendPushToUser(
      card.user_id,
      `${card.bank_name} Statement Ready`,
      `Import your ${card.card_name} statement to track this month's spending.`,
      '/cards'
    )
    sent++
  }

  return NextResponse.json({ sent })
}
