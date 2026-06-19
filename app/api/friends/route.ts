import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/friends — list my friends with their email
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows, error } = await supabase
    .from('friendships')
    .select('id, friend_id, created_at')
    .eq('user_id', user.id)
    .neq('friend_id', user.id) // exclude any accidental self-rows
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json([])

  const friendIds = rows.map(r => r.friend_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', friendIds)

  const emailMap = new Map((profiles ?? []).map((p: any) => [p.id, p.email]))

  return NextResponse.json(
    rows.map(r => ({
      id: r.id,
      friend_id: r.friend_id,
      email: emailMap.get(r.friend_id) ?? '',
      created_at: r.created_at,
    }))
  )
}

// POST /api/friends — add friend by email
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const normalized = email.trim().toLowerCase()

  // Look up the user in profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', normalized)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'No account found with that email address' }, { status: 404 })
  }

  // Self-check by ID (more reliable than comparing emails)
  if (profile.id === user.id) {
    return NextResponse.json({ error: 'You cannot add yourself as a friend' }, { status: 400 })
  }

  // Check already friends
  const { data: existing } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_id', user.id)
    .eq('friend_id', profile.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already in your friends list' }, { status: 409 })
  }

  // Insert A→B only; the DB trigger auto-inserts B→A with SECURITY DEFINER
  const { data, error } = await supabase
    .from('friendships')
    .insert({ user_id: user.id, friend_id: profile.id })
    .select('id, friend_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id, friend_id: data.friend_id, email: profile.email, created_at: data.created_at }, { status: 201 })
}

// DELETE /api/friends?id= — remove a friendship row
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Get the friend_id so we can delete both directions
  const { data: row } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  // Delete A→B only; the DB trigger auto-deletes B→A with SECURITY DEFINER
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
