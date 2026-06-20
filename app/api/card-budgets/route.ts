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
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  if (!cardId || !month || !year) {
    return NextResponse.json({ error: 'Missing card_id, month, or year' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('card_budgets')
    .select('*')
    .eq('user_id', user.id)
    .eq('card_id', cardId)
    .eq('month', parseInt(month))
    .eq('year', parseInt(year))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { card_id, category, amount, month, year } = await request.json()

  const { data, error } = await supabase
    .from('card_budgets')
    .upsert(
      { user_id: user.id, card_id, category, amount, month, year },
      { onConflict: 'user_id,card_id,category,month,year' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('card_budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
