import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cardId = searchParams.get('card_id')

  let query = supabase
    .from('card_statements')
    .select('*')
    .eq('user_id', user.id)
    .order('cycle_end', { ascending: false })

  if (cardId) query = query.eq('card_id', cardId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { card_id, cycle_start, cycle_end } = await request.json()
  if (!card_id || !cycle_start || !cycle_end) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Avoid duplicates — if same card + dates already exist, return existing
  const { data: existing } = await supabase
    .from('card_statements')
    .select('id')
    .eq('card_id', card_id)
    .eq('user_id', user.id)
    .eq('cycle_start', cycle_start)
    .eq('cycle_end', cycle_end)
    .maybeSingle()

  if (existing) return NextResponse.json(existing)

  const { data, error } = await supabase
    .from('card_statements')
    .insert({ card_id, user_id: user.id, cycle_start, cycle_end })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
