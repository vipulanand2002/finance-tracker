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

// ─── helper: cascade a contact's email/name change across EVERY denormalised
// reference the editing user owns — email columns, the linked account-id columns,
// and stored names. Runs with the service client but is strictly scoped to rows the
// user owns (splits/trips they created, tagged_payments they're a party to), so it
// never touches another user's data. Awaited by callers so it's reliable.
async function backfillAllReferences(
  userId: string,
  userEmail: string,
  oldName: string | null,
  newName: string,
  oldEmailRaw: string | null,
  newEmailRaw: string | null,
): Promise<string[]> {
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const errors: string[] = []
  const run = async (label: string, p: PromiseLike<{ error: unknown }>) => {
    try { const { error } = await p; if (error) errors.push(`${label}: ${(error as { message?: string })?.message ?? error}`) }
    catch (e) { errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const oldEmail = oldEmailRaw?.trim().toLowerCase() || null
  const newEmail = newEmailRaw?.trim().toLowerCase() || null
  const emailChanged = oldEmail !== newEmail
  const nameChanged = !!newName && oldName?.trim().toLowerCase() !== newName.trim().toLowerCase()

  // Resolve the account ids behind the old / new email (null if unregistered/cleared)
  const resolveId = async (email: string | null) => {
    if (!email) return null
    const { data } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
    return ((data as { id?: string } | null)?.id) ?? null
  }
  const [oldAccountId, newAccountId] = await Promise.all([resolveId(oldEmail), resolveId(newEmail)])
  const idChanged = oldAccountId !== newAccountId

  if (!emailChanged && !nameChanged && !idChanged) return errors

  // ── split_participants (splits created by this user) — nullable email, so this
  //    is also where clearing an email takes effect.
  const { data: userSplits } = await svc.from('expense_splits').select('id').eq('created_by', userId)
  const splitIds = (userSplits ?? []).map((s: { id: string }) => s.id)
  if (splitIds.length > 0) {
    const spPatch: Record<string, unknown> = { participant_email: newEmail, participant_user_id: newAccountId }
    if (nameChanged) spPatch.participant_name = newName
    if (oldEmail) {
      await run('split_participants(email)', svc.from('split_participants').update(spPatch).in('split_id', splitIds).eq('participant_email', oldEmail))
    }
    if (oldAccountId && idChanged) {
      await run('split_participants(uid)', svc.from('split_participants').update(spPatch).in('split_id', splitIds).eq('participant_user_id', oldAccountId))
    }
    if (newEmail && oldName) {
      await run('split_participants(name)', svc.from('split_participants').update(spPatch).in('split_id', splitIds).is('participant_email', null).ilike('participant_name', oldName))
    }
  }

  // ── expense_splits.paid_by (the creditor/payer) — fixes the reminder/balance side
  if (oldAccountId && idChanged) {
    await run('expense_splits.paid_by', svc.from('expense_splits').update({ paid_by: newAccountId }).eq('created_by', userId).eq('paid_by', oldAccountId))
  }

  // ── tagged_payments — to_email is NOT NULL (only moves to a real new email);
  //    from_email is nullable.
  if (oldEmail) {
    if (newEmail) {
      await run('tagged_payments(to)', svc.from('tagged_payments').update({ to_email: newEmail, to_user_id: newAccountId }).eq('from_user_id', userId).eq('to_email', oldEmail))
    } else if (idChanged) {
      await run('tagged_payments(to_uid)', svc.from('tagged_payments').update({ to_user_id: newAccountId }).eq('from_user_id', userId).eq('to_email', oldEmail))
    }
    const fromPatch: Record<string, unknown> = { from_email: newEmail, from_user_id: newAccountId }
    if (nameChanged) fromPatch.from_name = newName
    await run('tagged_payments(from)', svc.from('tagged_payments').update(fromPatch).eq('to_user_id', userId).eq('from_email', oldEmail))
  }

  // The remaining tables have NOT NULL email columns (no-email people are stored
  // with a `_nomail_…@local` placeholder, not null). We match rows two ways: by the
  // old email, and — when adding/changing an email on a name-only member — by name
  // against the placeholder. Email is only ever set to a real new email (can't null).
  const byOldEmail = !!oldEmail && (newEmail || nameChanged)
  const byName = !!newEmail && !!oldName
  if (byOldEmail || byName) {
    // ── trip_invitations sent by this user
    if (byOldEmail) {
      const p: Record<string, unknown> = {}
      if (newEmail) p.invitee_email = newEmail
      if (nameChanged) p.invitee_name = newName
      await run('trip_invitations', svc.from('trip_invitations').update(p).eq('inviter_id', userId).eq('invitee_email', oldEmail))
    }
    if (byName) {
      const p: Record<string, unknown> = { invitee_email: newEmail }
      if (nameChanged) p.invitee_name = newName
      await run('trip_invitations(name)', svc.from('trip_invitations').update(p).eq('inviter_id', userId).ilike('invitee_name', oldName!).like('invitee_email', '_nomail_%'))
    }

    // ── trips owned by this user → trip_members (+ trip_personal_budgets)
    const { data: userTrips } = await svc.from('trips').select('id').eq('user_id', userId)
    const tripIds = (userTrips ?? []).map((t: { id: string }) => t.id)
    if (tripIds.length > 0) {
      // UNIQUE(trip_id,email) / UNIQUE(trip_id,user_id) can collide → tolerate
      if (byOldEmail) {
        const p: Record<string, unknown> = {}
        if (newEmail) p.email = newEmail
        if (nameChanged) p.name = newName
        await run('trip_members', svc.from('trip_members').update(p).in('trip_id', tripIds).eq('email', oldEmail))
      }
      if (byName) {
        const p: Record<string, unknown> = { email: newEmail }
        if (nameChanged) p.name = newName
        await run('trip_members(name)', svc.from('trip_members').update(p).in('trip_id', tripIds).ilike('name', oldName!).like('email', '_nomail_%'))
      }
      if (oldEmail && newEmail) {
        await run('trip_personal_budgets', svc.from('trip_personal_budgets').update({ user_email: newEmail, user_id: newAccountId }).in('trip_id', tripIds).eq('user_email', oldEmail))
      }
    }

    // ── split_notifications created by this user
    if (oldEmail && newEmail) {
      await run('split_notifications', svc.from('split_notifications').update({ invitee_email: newEmail }).eq('creator_email', userEmail).eq('invitee_email', oldEmail))
    }
  }

  return errors
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

  // Back-fill references for a new contact (no old email): link any rows that were
  // added by this name before the contact existed, and set account ids.
  if (email) {
    await backfillAllReferences(user.id, user.email?.toLowerCase() ?? '', name, name, null, email)
      .catch(() => [])
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

  // Fetch old name + email before updating so we can propagate changes
  const { data: oldContact } = await supabase
    .from('contacts')
    .select('name, email')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const oldEmail = oldContact?.email ?? null
  const oldName = oldContact?.name ?? null

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

  // Propagate the email/name change (including clearing the email) across every
  // denormalised reference this user owns. Awaited so it completes before we respond.
  const backfillWarnings = await backfillAllReferences(
    user.id, user.email?.toLowerCase() ?? '', oldName, name, oldEmail, email,
  ).catch((e) => [e instanceof Error ? e.message : String(e)])

  return NextResponse.json({
    ...contact,
    connected: !!friendUserId,
    friend_user_id: friendUserId,
    friendship_id: friendshipId,
    ...(backfillWarnings.length > 0 ? { backfill_warnings: backfillWarnings } : {}),
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
