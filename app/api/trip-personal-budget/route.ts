import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET ?trip_id=X          → all personal budgets for that trip
// GET ?trip_id=X&mine=true → only the current user's budget (single object or null)
export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const tripId = params.get('trip_id')
  if (!tripId) return NextResponse.json({ error: 'Missing trip_id' }, { status: 400 })

  if (params.get('mine') === 'true') {
    const { data, error } = await supabase
      .from('trip_personal_budgets')
      .select('*')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('trip_personal_budgets')
    .select('*')
    .eq('trip_id', tripId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST { trip_id, amount, is_private? } → upsert current user's personal budget
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trip_id, amount, is_private } = await request.json()
  if (!trip_id || amount == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('trip_personal_budgets')
    .upsert(
      { trip_id, user_id: user.id, user_email: user.email, amount, is_private: is_private ?? false },
      { onConflict: 'trip_id,user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// DELETE ?trip_id=X → remove current user's personal budget
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tripId = new URL(request.url).searchParams.get('trip_id')
  if (!tripId) return NextResponse.json({ error: 'Missing trip_id' }, { status: 400 })

  const { error } = await supabase
    .from('trip_personal_budgets')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
