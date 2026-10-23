import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Daily: remove splits that were settled more than 6 months ago, to save space.
// Splits linked to a trip are never touched. Deleting a split also removes its
// participants and notifications; transactions that were linked to it stay (they
// just lose the link), so spending history is unchanged.
const KEEP_MONTHS = 6
const BATCH = 100

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - KEEP_MONTHS)

  const { data, error } = await supabase
    .from('expense_splits')
    .select('id')
    .eq('is_settled', true)
    .is('trip_id', null)
    .not('settled_at', 'is', null)
    .lt('settled_at', cutoff.toISOString())
    .limit(1000)

  if (error) {
    // settled_at column missing → migration 049 hasn't been run yet; nothing is deleted
    if (error.message.includes('settled_at')) return NextResponse.json({ deleted: 0, skipped: 'run migration 049_split_settled_at.sql' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (data ?? []).map((r: { id: string }) => r.id)
  let deleted = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { error: delErr } = await supabase.from('expense_splits').delete().in('id', chunk)
    if (delErr) return NextResponse.json({ error: delErr.message, deleted }, { status: 500 })
    deleted += chunk.length
  }

  return NextResponse.json({ deleted, olderThan: cutoff.toISOString() })
}
