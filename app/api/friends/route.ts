import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// ─── GET /api/friends ─────────────────────────────────────────────────────────
// Returns all contacts, enriched with connected status and friend_user_id
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!contacts || contacts.length === 0) return NextResponse.json([])

  // Batch-lookup profiles for contacts that have emails
  const emails = contacts
    .map((c: { email: string | null }) => c.email?.toLowerCase())
    .filter(Boolean) as string[]

  type ProfileRow = { id: string; email: string; full_name: string | null; avatar_url: string | null; avatar_public: boolean }
  let profilesByEmail: Map<string, ProfileRow> = new Map()
  if (emails.length > 0) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profiles } = await serviceClient
      .from('profiles')
      .select('id, email, full_name, avatar_url, avatar_public')
      .in('email', emails)

    profilesByEmail = new Map(
      (profiles ?? []).map((p: ProfileRow) => [p.email.toLowerCase(), p])
    )
  }

  // Fetch existing friendship rows so we know friendship_id for deletion
  const { data: friendships } = await supabase
    .from('friendships')
    .select('id, friend_id')
    .eq('user_id', user.id)

  const friendshipByUserId = new Map(
    (friendships ?? []).map((f: { id: string; friend_id: string }) => [f.friend_id, f.id])
  )

  // Fetch outgoing friend requests to know pending/rejected status per contact
  const allProfileIds = [...profilesByEmail.values()].map(p => p.id).filter(id => id !== user.id)
  const outgoingByUserId = new Map<string, string>()
  if (allProfileIds.length > 0) {
    const { data: outgoing } = await supabase
      .from('friend_requests')
      .select('to_user_id, status')
      .eq('from_user_id', user.id)
      .in('to_user_id', allProfileIds)
    for (const r of outgoing ?? []) outgoingByUserId.set(r.to_user_id, r.status)
  }

  return NextResponse.json(
    contacts.map((c: { id: string; name: string; email: string | null; notes: string | null; created_at: string }) => {
      const profile = c.email ? (profilesByEmail.get(c.email.toLowerCase()) ?? null) : null
      const friendUserId = profile?.id ?? null
      const friendshipId = friendUserId ? (friendshipByUserId.get(friendUserId) ?? null) : null
      const requestStatus = friendUserId && !friendshipId ? (outgoingByUserId.get(friendUserId) ?? null) : null
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        notes: c.notes,
        created_at: c.created_at,
        connected: !!friendshipId,
        friend_user_id: friendUserId,
        friendship_id: friendshipId,
        request_status: requestStatus,
        // Use friend's own registered name if available, else keep what the user saved
        display_name: profile?.full_name || c.name,
        // Only expose avatar if the friend has opted in
        avatar_url: (profile?.avatar_public && profile?.avatar_url) ? profile.avatar_url : null,
      }
    })
  )
}

// ─── POST /api/friends ────────────────────────────────────────────────────────
// Body: { name, email?, notes? }
// Saves to contacts. If email matches a profile → also creates friendship for chat.
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const email = body.email?.trim().toLowerCase() || null
  const notes = body.notes?.trim() || null

  // Insert into contacts
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .insert({ user_id: user.id, name, email, notes })
    .select()
    .single()

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })

  let friendUserId: string | null = null
  let friendshipId: string | null = null

  let requestStatus: string | null = null

  if (email) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (profile?.id && profile.id !== user.id) {
      friendUserId = profile.id

      // Check if already friends
      const { data: existing } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', user.id)
        .eq('friend_id', profile.id)
        .maybeSingle()

      if (existing) {
        // Already connected — return existing friendship
        friendshipId = existing.id
      } else {
        // Check for an existing friend request
        const { data: existingReq } = await supabase
          .from('friend_requests')
          .select('id, status')
          .eq('from_user_id', user.id)
          .eq('to_user_id', profile.id)
          .maybeSingle()

        if (existingReq) {
          requestStatus = existingReq.status
        } else {
          // Get sender's display name for the request row
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          const senderName =
            senderProfile?.full_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] || ''

          // Create a friend request (not a direct friendship)
          await supabase
            .from('friend_requests')
            .insert({
              from_user_id: user.id,
              to_user_id: profile.id,
              from_name: senderName,
              from_email: user.email?.toLowerCase() || '',
            })

          requestStatus = 'pending'
        }
      }
    }
  }

  return NextResponse.json({
    ...contact,
    connected: !!friendshipId,
    friend_user_id: friendUserId,
    friendship_id: friendshipId,
    request_status: requestStatus,
  }, { status: 201 })
}

// ─── PUT /api/friends?id= ─────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const email = body.email?.trim().toLowerCase() || null
  const notes = body.notes?.trim() || null

  const { data: contact, error } = await supabase
    .from('contacts')
    .update({ name, email, notes })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-evaluate connected status
  let friendUserId: string | null = null
  let friendshipId: string | null = null

  if (email) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (profile?.id && profile.id !== user.id) {
      friendUserId = profile.id

      const { data: existing } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', user.id)
        .eq('friend_id', profile.id)
        .maybeSingle()

      if (!existing) {
        const { data: fs } = await supabase
          .from('friendships')
          .insert({ user_id: user.id, friend_id: profile.id })
          .select('id')
          .single()
        friendshipId = fs?.id ?? null
      } else {
        friendshipId = existing.id
      }
    }
  }

  return NextResponse.json({
    ...contact,
    connected: !!friendUserId,
    friend_user_id: friendUserId,
    friendship_id: friendshipId,
  })
}

// ─── DELETE /api/friends?id= ──────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Get the contact first to find email
  const { data: contact } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  // Delete contact
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If there's a friendship row, remove it too
  if (contact?.email) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', contact.email.toLowerCase())
      .single()

    if (profile?.id) {
      await supabase
        .from('friendships')
        .delete()
        .eq('user_id', user.id)
        .eq('friend_id', profile.id)
    }
  }

  return NextResponse.json({ success: true })
}
