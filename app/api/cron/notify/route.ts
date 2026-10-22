import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'
import { parseNotifySettings, timeToMinutes } from '@/lib/notify-settings'

// How long after its scheduled time a reminder may still go out (the scheduler
// polls every ~15 min and can run late). It is sent at most once per slot per day.
const CATCH_UP_MINUTES = 90

// The caller (scheduler) must present NOTIFY_SECRET (or the existing CRON_SECRET)
function authorised(request: Request) {
  const header = request.headers.get('authorization')
  return [process.env.NOTIFY_SECRET, process.env.CRON_SECRET].some(s => !!s && header === `Bearer ${s}`)
}

// Current wall-clock date/time in a timezone
function localNow(tz: string): { date: string; month: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())
  } catch {
    return localNow('Asia/Kolkata')
  }
  const v = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { date: `${v('year')}-${v('month')}-${v('day')}`, month: `${v('year')}-${v('month')}`, minutes: Number(v('hour')) * 60 + Number(v('minute')) }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let sent = 0
  let checked = 0

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users.length) break

    for (const user of data.users) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const settings = parseNotifySettings(meta.notify)
      if (!settings?.enabled || settings.times.length === 0) continue
      checked++

      const now = localNow(settings.tz)
      const done = (meta.notify_sent && typeof meta.notify_sent === 'object' ? meta.notify_sent : {}) as Record<string, string>
      // Slots whose time has passed (within the catch-up window) and haven't gone out today
      const due = settings.times.filter(t => {
        const diff = now.minutes - timeToMinutes(t)
        return diff >= 0 && diff < CATCH_UP_MINUTES && done[t] !== now.date
      })
      if (due.length === 0) continue

      // Spending summary: today + this month, leaving out accounts excluded from spending
      let excluded: string[] = []
      const acc = await supabase.from('accounts').select('id').eq('user_id', user.id).eq('include_in_spending', false)
      if (!acc.error) excluded = (acc.data ?? []).map((a: { id: string }) => a.id)
      const { data: txs } = await supabase
        .from('transactions')
        .select('amount, date, account_id')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', `${now.month}-01`)
        .lte('date', `${now.month}-31`)
      const rows = (txs ?? []).filter((t: { account_id: string | null }) => !t.account_id || !excluded.includes(t.account_id))
      const monthTotal = rows.reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)
      const today = rows.filter((t: { date: string }) => t.date === now.date)
      const todayTotal = today.reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

      const hour = Math.floor(now.minutes / 60)
      const title = hour < 12 ? 'Good morning' : hour < 17 ? 'Afternoon check-in' : 'Evening wrap-up'
      const body = today.length === 0
        ? `Nothing logged today yet. Add your expenses to stay on track — ${inr(monthTotal)} spent this month.`
        : `Spent today: ${inr(todayTotal)} across ${today.length} transaction${today.length !== 1 ? 's' : ''} · ${inr(monthTotal)} this month.`

      // One notification per run even if several slots were missed
      const n = await sendPushToUser(user.id, title, body, '/dashboard')
      if (n > 0) {
        sent++
        const marks = { ...done }
        for (const t of due) marks[t] = now.date
        // Keep only today's marks so the map doesn't grow forever
        for (const k of Object.keys(marks)) if (marks[k] !== now.date) delete marks[k]
        await supabase.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, notify_sent: marks } })
      }
    }
    if (data.users.length < 200) break
  }

  return NextResponse.json({ checked, sent })
}
