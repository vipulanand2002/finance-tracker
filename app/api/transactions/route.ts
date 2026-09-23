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
  const contactId = searchParams.get('contact_id')

  // For trip-scoped queries: RLS handles visibility (own txs + trip participant txs)
  // For all other queries: restrict to own transactions only
  let query = tripId
    ? supabase.from('transactions').select('*, contacts(name, email)').eq('trip_id', tripId).order('created_at', { ascending: false })
    : supabase.from('transactions').select('*, contacts(name, email)').eq('user_id', user.id).order('created_at', { ascending: false })

  if (!tripId) {
    if (type && type !== 'all') query = query.eq('type', type)
    if (category) query = query.eq('category', category)
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    if (search) query = query.ilike('description', `%${search}%`)
    // Exclude all card-related transactions (card imports + Card Payment entries)
    if (excludeCard) query = query.is('card_id', null).neq('category', 'Card Payment')
    // Filter to specific card or any card transaction
    if (cardId) query = query.eq('card_id', cardId)
    else if (hasCard) query = query.not('card_id', 'is', null)
    if (contactId) query = query.or(`contact_id.eq.${contactId},contact_ids.cs.{${contactId}}`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Explicit column list so unrecognised fields never reach Supabase
  // (contact_id / contact_ids require migration 039 — safe to include; Supabase ignores
  //  null values for missing columns and the migration adds them if not yet applied)
  const payload: Record<string, unknown> = {
    user_id: user.id,
    amount: body.amount,
    type: body.type,
    category: body.category,
    description: body.description ?? null,
    date: body.date,
    is_recurring: body.is_recurring ?? false,
    is_discrete: body.is_discrete ?? false,
    receipt_url: body.receipt_url ?? null,
    trip_id: body.trip_id ?? null,
    card_id: body.card_id ?? null,
    split_id: body.split_id ?? null,
  }
  // Only include contact columns once the schema has them (graceful degradation)
  if (body.contact_id !== undefined) payload.contact_id = body.contact_id ?? null
  if (body.contact_ids !== undefined) payload.contact_ids = body.contact_ids ?? []

  // First attempt with all fields; if schema cache error, retry without contact columns
  let { data, error } = await supabase.from('transactions').insert(payload).select().single()
  if (error?.message?.includes('contact_id')) {
    delete payload.contact_id
    delete payload.contact_ids
    ;({ data, error } = await supabase.from('transactions').insert(payload).select().single())
  }

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

  const patch: Record<string, unknown> = {
    amount: body.amount,
    type: body.type,
    category: body.category,
    description: body.description ?? null,
    date: body.date,
    is_recurring: body.is_recurring ?? false,
    is_discrete: body.is_discrete ?? false,
    receipt_url: body.receipt_url ?? null,
    trip_id: body.trip_id ?? null,
    card_id: body.card_id ?? null,
    split_id: body.split_id ?? null,
  }
  if (body.contact_id !== undefined) patch.contact_id = body.contact_id ?? null
  if (body.contact_ids !== undefined) patch.contact_ids = body.contact_ids ?? []

  let { data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single()
  if (error?.message?.includes('contact_id')) {
    delete patch.contact_id
    delete patch.contact_ids
    ;({ data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const patch: Record<string, unknown> = {}
  if (body.split_id !== undefined) patch.split_id = body.split_id ?? null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to patch' }, { status: 400 })

  const { data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single()
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
