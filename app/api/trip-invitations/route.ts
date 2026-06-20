import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET — pending invitations for the current user (invitee)
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('trip_invitations')
    .select('*')
    .eq('invitee_email', user.email ?? '')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — send invitations for a trip (called from trips API)
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trip_id, trip_name, members } = await request.json()
  // members: { email: string; name?: string }[]

  if (!trip_id || !Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: 'Missing trip_id or members' }, { status: 400 })
  }

  const rows = members.map((m: { email: string; name?: string }) => ({
    trip_id,
    trip_name,
    inviter_id: user.id,
    inviter_email: user.email ?? '',
    invitee_email: m.email.toLowerCase(),
    invitee_name: m.name ?? null,
    status: 'pending',
  }))

  const { error } = await supabase
    .from('trip_invitations')
    .upsert(rows, { onConflict: 'trip_id,invitee_email' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, { status: 201 })
}

// PATCH — accept or decline an invitation
export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { status } = await request.json()
  if (!['accepted', 'declined'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('trip_invitations')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('invitee_email', user.email ?? '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
