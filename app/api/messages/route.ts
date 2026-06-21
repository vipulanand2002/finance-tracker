import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/messages?friend_id=xxx — fetch conversation with a specific friend
export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const friendId = new URL(request.url).searchParams.get('friend_id')
  if (!friendId) return NextResponse.json({ error: 'friend_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      split:split_id (
        id, title, total_amount, category, date,
        split_participants ( id, participant_name, participant_email, amount_owed, is_paid )
      )
    `)
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),` +
      `and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`
    )
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/messages — send a text message to a friend
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { receiver_id, content } = await request.json()
  if (!receiver_id || !content?.trim()) {
    return NextResponse.json({ error: 'receiver_id and content are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id,
      content: content.trim(),
      type: 'text',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
