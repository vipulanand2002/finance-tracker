import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/splits — all splits for the user (created + participating)
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: created } = await supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .eq('created_by', user.id)
    .order('date', { ascending: false })

  const { data: participating } = await supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .neq('created_by', user.id)
    .in('id',
      (await supabase
        .from('split_participants')
        .select('split_id')
        .eq('participant_user_id', user.id)
      ).data?.map(r => r.split_id) ?? []
    )
    .order('date', { ascending: false })

  const all = [...(created ?? []), ...(participating ?? [])]
  all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json(all)
}

// POST /api/splits — create split + participants
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { participants, ...splitData } = await request.json()

  const { data: split, error: splitError } = await supabase
    .from('expense_splits')
    .insert({ ...splitData, created_by: user.id })
    .select()
    .single()

  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 })

  if (participants?.length) {
    const { error: partError } = await supabase
      .from('split_participants')
      .insert(participants.map((p: { name: string; email?: string; amount: number; userId?: string }) => ({
        split_id: split.id,
        participant_name: p.name,
        participant_email: p.email ?? null,
        participant_user_id: p.userId ?? null,
        amount_owed: p.amount,
      })))

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })
  }

  return NextResponse.json(split, { status: 201 })
}

// PATCH /api/splits?id=xxx — mark participant as paid / settle split
export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const type = searchParams.get('type') // 'participant' | 'settle'

  const body = await request.json()

  if (type === 'participant') {
    const { error } = await supabase
      .from('split_participants')
      .update({ is_paid: body.is_paid, paid_at: body.is_paid ? new Date().toISOString() : null })
      .eq('id', id!)
      .eq('split_id', body.split_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (type === 'settle') {
    const { error } = await supabase
      .from('expense_splits')
      .update({ is_settled: true })
      .eq('id', id!)
      .eq('created_by', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// DELETE /api/splits?id=xxx
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { error } = await supabase
    .from('expense_splits')
    .delete()
    .eq('id', id!)
    .eq('created_by', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
