import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/settlements — the user's recorded settlements (newest first).
// If migration 045 hasn't been applied yet the table doesn't exist; we report
// { available: false } instead of failing so the rest of the app keeps working.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('settlements')
    .select('*')
    .eq('user_id', user.id)
    .order('settled_at', { ascending: false })

  if (error) return NextResponse.json({ available: false, rows: [] })
  return NextResponse.json({ available: true, rows: data ?? [] })
}
