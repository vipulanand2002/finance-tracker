import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trips, error } = await supabase
    .from('trips')
    .select('*, trip_budgets(*), trip_members(*), transactions(amount, type)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (trips ?? []).map(trip => {
    const txs = (trip.transactions ?? []) as { amount: number; type: string }[]
    return {
      ...trip,
      total_spent: txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      transaction_count: txs.length,
      transactions: undefined,
    }
  })

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { trip_budgets: budgets, trip_members: members, ...tripData } = body

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ ...tripData, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (Array.isArray(budgets) && budgets.length > 0) {
    await supabase.from('trip_budgets').insert(
      budgets.map((b: { category: string; amount: number }) => ({
        trip_id: trip.id, category: b.category, amount: b.amount,
      }))
    )
  }

  if (Array.isArray(members) && members.length > 0) {
    await supabase.from('trip_members').insert(
      members.map((m: { email: string; name?: string }) => ({
        trip_id: trip.id, email: m.email, name: m.name ?? null,
      }))
    )
  }

  return NextResponse.json(trip, { status: 201 })
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const { trip_budgets: budgets, trip_members: members, ...tripData } = body

  const { error } = await supabase
    .from('trips')
    .update(tripData)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (Array.isArray(budgets)) {
    await supabase.from('trip_budgets').delete().eq('trip_id', id)
    if (budgets.length > 0) {
      await supabase.from('trip_budgets').insert(
        budgets.map((b: { category: string; amount: number }) => ({
          trip_id: id, category: b.category, amount: b.amount,
        }))
      )
    }
  }

  if (Array.isArray(members)) {
    await supabase.from('trip_members').delete().eq('trip_id', id)
    if (members.length > 0) {
      await supabase.from('trip_members').insert(
        members.map((m: { email: string; name?: string }) => ({
          trip_id: id, email: m.email, name: m.name ?? null,
        }))
      )
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Unlink transactions before deleting (ON DELETE SET NULL handles DB side)
  const { error } = await supabase.from('trips').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
