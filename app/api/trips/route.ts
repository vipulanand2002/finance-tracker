import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

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
  const directRows: { trip_id: string; email: string | null; name: string | null }[] = []
  const inviteRows: { email: string; name: string | null }[] = []

  for (const m of members) {
    const email = m.email?.trim().toLowerCase() || null

    if (!email) {
      // No email → add directly as name-only member
      directRows.push({ trip_id: tripId, email: null, name: m.name?.trim() || null })
      continue
    }

    // Check if user has an account
    const { data: profile } = await svc
      .from('profiles').select('id').eq('email', email).maybeSingle()

    if (!profile) {
      // No account → add directly
      directRows.push({ trip_id: tripId, email, name: m.name?.trim() || null })
      continue
    }

    // Has account — check friendship
    const { data: friendship } = await supabase
      .from('friendships').select('id')
      .eq('user_id', userId).eq('friend_id', profile.id).maybeSingle()

    if (friendship) {
      directRows.push({ trip_id: tripId, email, name: m.name?.trim() || null })
    } else {
      inviteRows.push({ email, name: m.name?.trim() || null })
    }
  }

  if (directRows.length > 0) {
    // Use service client to bypass RLS — trip_members inserts require elevated privileges
    await svc.from('trip_members').insert(directRows)
  }

  if (inviteRows.length > 0) {
    await supabase.from('trip_invitations').upsert(
      inviteRows.map(m => ({
        trip_id: tripId, trip_name: tripName,
        inviter_id: userId, inviter_email: userEmail,
        invitee_email: m.email, invitee_name: m.name,
        status: 'pending',
      })),
      { onConflict: 'trip_id,invitee_email' }
    )
  }
}

export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: trips, error } = await supabase
    .from('trips')
    .select('*, trip_budgets(*), transactions(amount, type, is_discrete)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tripIds = (trips ?? []).map(t => t.id as string)

  // Use service client to read trip_members and trip_invitations without RLS restrictions
  const svcGet = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
    const submittedEmails = members
      .filter((m: { email: string }) => m.email?.trim())
      .map((m: { email: string }) => m.email.trim().toLowerCase())

    // Remove name-only members and re-insert (they have no stable key)
    await svcPatch.from('trip_members').delete().eq('trip_id', id).is('email', null)
    await svcPatch.from('trip_members').delete().eq('trip_id', id).eq('email', '')

    // Remove email-based members that were dropped
    const { data: currentMembers } = await svcPatch
      .from('trip_members').select('email').eq('trip_id', id)
    const currentEmails = (currentMembers ?? [])
      .map((m: { email: string | null }) => m.email?.toLowerCase())
      .filter(Boolean) as string[]
    const toRemoveEmails = currentEmails.filter(e => !submittedEmails.includes(e))
    if (toRemoveEmails.length > 0) {
      await svcPatch.from('trip_members').delete().eq('trip_id', id).in('email', toRemoveEmails)
      await supabase.from('trip_invitations').delete()
        .eq('trip_id', id).in('invitee_email', toRemoveEmails).eq('status', 'pending')
    }

    // Determine which email-based members are truly new (not already accepted or pending)
    const { data: currentInvitations } = await supabase
      .from('trip_invitations').select('invitee_email').eq('trip_id', id).eq('status', 'pending')
    const pendingEmails = new Set(
      (currentInvitations ?? []).map((i: { invitee_email: string }) => i.invitee_email.toLowerCase())
    )
    const updatedCurrentEmails = new Set(
      (currentEmails ?? []).filter(e => !toRemoveEmails.includes(e))
    )
    const newMembers = members.filter((m: { email: string }) => {
      const e = m.email?.trim().toLowerCase()
      return !e || (!updatedCurrentEmails.has(e) && !pendingEmails.has(e))
    })

    const tripName = (tripData as { name?: string }).name ??
      (await supabase.from('trips').select('name').eq('id', id).single()).data?.name ?? ''
    await addMembersToTrip(supabase, id, tripName, user.id, user.email ?? '', newMembers)
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
