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
  const tripId = searchParams.get('trip_id')
  if (!tripId) return NextResponse.json({ error: 'Missing trip_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('trip_messages')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trip_id, content } = await request.json()
  if (!trip_id || !content?.trim()) {
    return NextResponse.json({ error: 'Missing trip_id or content' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('trip_messages')
    .insert({
      trip_id,
      user_id: user.id,
      sender_email: user.email ?? '',
      content: content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
