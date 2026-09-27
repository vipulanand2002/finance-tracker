import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Use trip_invitations as source of truth for all members.
// Friends/no-account/name-only → status='accepted' (immediate membership).
// Non-friend with account → status='pending' (real invitation flow).
// Name-only members get a unique placeholder email so the unique constraint holds.
async function addMembersToTrip(
  supabase: SupabaseClient,
  tripId: string,
  tripName: string,
  userId: string,
  userEmail: string,
  members: { email: string; name?: string | null }[]
) {
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const rows: {
    trip_id: string; trip_name: string; inviter_id: string; inviter_email: string;
    invitee_email: string; invitee_name: string | null; status: string
  }[] = []

  for (const m of members) {
    const rawEmail = m.email?.trim().toLowerCase() || null
    // Name-only members get a unique placeholder so the unique constraint is satisfied
    const inviteeEmail = rawEmail || `_nomail_${Math.random().toString(36).slice(2, 9)}@local`
    let status = 'accepted'

    if (rawEmail) {
      const { data: profile } = await svc
        .from('profiles').select('id').eq('email', rawEmail).maybeSingle()

      if (profile && profile.id !== userId) {
        const { data: friendship } = await supabase
          .from('friendships').select('id')
          .eq('user_id', userId).eq('friend_id', profile.id).maybeSingle()
        if (!friendship) status = 'pending'
      }
    }

    rows.push({
      trip_id: tripId, trip_name: tripName,
      inviter_id: userId, inviter_email: userEmail,
      invitee_email: inviteeEmail,
      invitee_name: m.name?.trim() || null,
      status,
    })
  }

  if (rows.length > 0) {
    await svc.from('trip_invitations').upsert(rows, { onConflict: 'trip_id,invitee_email' })
  }
}

export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svcGet = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const myEmail = (user.email ?? '').toLowerCase()

  // Trips I own (RLS)
  const { data: ownedTrips, error } = await supabase
    .from('trips')
    .select('*, trip_budgets(*), transactions(amount, type, is_discrete)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trips I'm a member of via an accepted invitation or a legacy trip_members row
  const [{ data: myInvites }, { data: myMemberships }] = await Promise.all([
    svcGet.from('trip_invitations').select('trip_id').eq('invitee_email', myEmail).eq('status', 'accepted'),
    svcGet.from('trip_members').select('trip_id').eq('email', myEmail),
  ])
  const ownedIds = new Set((ownedTrips ?? []).map(t => t.id as string))
  const memberTripIds = [...new Set([
    ...(myInvites ?? []).map((r: { trip_id: string }) => r.trip_id),
    ...(myMemberships ?? []).map((r: { trip_id: string }) => r.trip_id),
  ])].filter(id => !ownedIds.has(id))

  let memberTrips: Record<string, unknown>[] = []
  if (memberTripIds.length > 0) {
    const { data } = await svcGet
      .from('trips')
      .select('*, trip_budgets(*), transactions(amount, type, is_discrete)')
      .in('id', memberTripIds)
    memberTrips = data ?? []
  }

  const trips = [...(ownedTrips ?? []), ...memberTrips]
  const tripIds = trips.map(t => t.id as string)

  const [{ data: allMembers }, { data: allInvitations }] = await Promise.all([
    tripIds.length > 0 ? svcGet.from('trip_members').select('*').in('trip_id', tripIds) : Promise.resolve({ data: [] }),
    tripIds.length > 0 ? svcGet.from('trip_invitations').select('*').in('trip_id', tripIds) : Promise.resolve({ data: [] }),
  ])

  const membersByTrip = new Map<string, object[]>()
  const invitesByTrip = new Map<string, object[]>()
  for (const m of allMembers ?? []) {
    const tid = (m as { trip_id: string }).trip_id
    if (!membersByTrip.has(tid)) membersByTrip.set(tid, [])
    membersByTrip.get(tid)!.push(m)
  }
  for (const i of allInvitations ?? []) {
    const tid = (i as { trip_id: string }).trip_id
    if (!invitesByTrip.has(tid)) invitesByTrip.set(tid, [])
    invitesByTrip.get(tid)!.push(i)
  }

  const enriched = (trips ?? []).map(trip => {
    const txs = (trip.transactions ?? []) as { amount: number; type: string; is_discrete?: boolean }[]
    return {
      ...trip,
      is_owner: trip.user_id === user.id,
      total_spent: txs.filter(t => t.type === 'expense' && !t.is_discrete).reduce((s, t) => s + t.amount, 0),
      transaction_count: txs.length,
      transactions: undefined,
      trip_members: membersByTrip.get(trip.id) ?? [],
      trip_invitations: invitesByTrip.get(trip.id) ?? [],
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
    await addMembersToTrip(supabase, trip.id, trip.name, user.id, user.email ?? '', members)
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
    const svcPatch = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Read all current invitations for this trip via service client
    const { data: currentInvitations } = await svcPatch
      .from('trip_invitations').select('id, invitee_email, status')
      .eq('trip_id', id).neq('status', 'declined')

    // Delete placeholder (name-only) rows — they'll be regenerated with new placeholders
    const placeholderIds = (currentInvitations ?? [])
      .filter((i: { invitee_email: string }) => i.invitee_email.startsWith('_nomail_'))
      .map((i: { id: string }) => i.id)
    if (placeholderIds.length > 0) {
      await svcPatch.from('trip_invitations').delete().in('id', placeholderIds)
    }

    // Real-email members currently in the trip
    const currentRealEmails = (currentInvitations ?? [])
      .filter((i: { invitee_email: string }) => !i.invitee_email.startsWith('_nomail_'))
      .map((i: { invitee_email: string }) => i.invitee_email.toLowerCase())

    // Submitted real-email members
    const submittedEmails = members
      .filter((m: { email: string }) => m.email?.trim())
      .map((m: { email: string }) => m.email.trim().toLowerCase())

    // Remove real-email members that the owner dropped
    const toRemove = currentRealEmails.filter(e => !submittedEmails.includes(e))
    if (toRemove.length > 0) {
      await svcPatch.from('trip_invitations').delete()
        .eq('trip_id', id).in('invitee_email', toRemove)
    }

    // Add only members that aren't already in the trip (avoid duplicate real-email rows)
    const remaining = new Set(currentRealEmails.filter(e => !toRemove.includes(e)))
    const newMembers = members.filter((m: { email: string }) => {
      const e = m.email?.trim().toLowerCase()
      return !e || !remaining.has(e) // name-only always re-added; email-based only if new
    })

    const tripName = (tripData as { name?: string }).name ??
      (await svcPatch.from('trips').select('name').eq('id', id).single()).data?.name ?? ''
    if (newMembers.length > 0) {
      await addMembersToTrip(supabase, id, tripName, user.id, user.email ?? '', newMembers)
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
