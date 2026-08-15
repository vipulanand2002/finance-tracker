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
  const type = searchParams.get('type')
  const category = searchParams.get('category')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')
  const tripId = searchParams.get('trip_id')
  const excludeCard = searchParams.get('exclude_card') === 'true'
  const cardId = searchParams.get('card_id')
  const hasCard = searchParams.get('has_card') === 'true'

  // For trip-scoped queries: RLS handles visibility (own txs + trip participant txs)
  // For all other queries: restrict to own transactions only
  let query = tripId
    ? supabase.from('transactions').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })
    : supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

  if (!tripId) {
    if (type && type !== 'all') query = query.eq('type', type)
    if (category) query = query.eq('category', category)
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    if (search) query = query.ilike('description', `%${search}%`)
    // Exclude card transactions but keep Card Payments (real cash outflow)
    if (excludeCard) query = query.or('card_id.is.null,category.eq.Card Payment')
    // Filter to specific card or any card transaction
    if (cardId) query = query.eq('card_id', cardId)
    else if (hasCard) query = query.not('card_id', 'is', null)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('transactions')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  // Delete ALL transactions for this user
  if (searchParams.get('all') === 'true') {
    const { error } = await supabase.from('transactions').delete().eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
