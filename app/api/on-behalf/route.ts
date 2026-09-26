import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

function service() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Resolve a contact (belonging to the caller) to a registered user id.
async function resolveFriendUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  contactId: string,
): Promise<{ friendId: string; email: string } | null> {
  const { data: contact } = await supabase
    .from('contacts').select('email').eq('id', contactId).eq('user_id', userId).single()
  const email = contact?.email?.toLowerCase()
  if (!email) return null
  const { data: profile } = await service().from('profiles').select('id').eq('email', email).single()
  if (!profile?.id || profile.id === userId) return null
  return { friendId: profile.id, email }
}

// Is the friend a member of this trip (owner / invitation / member)?
async function friendInTrip(tripId: string, friendId: string, friendEmail: string): Promise<boolean> {
  const svc = service()
  const { data: trip } = await svc.from('trips').select('user_id').eq('id', tripId).single()
  if (!trip) return false
  if (trip.user_id === friendId) return true
  const { data: inv } = await svc.from('trip_invitations').select('id').eq('trip_id', tripId).eq('invitee_email', friendEmail).neq('status', 'declined').limit(1)
  if (inv?.length) return true
  const { data: mem } = await svc.from('trip_members').select('id').eq('trip_id', tripId).eq('email', friendEmail).limit(1)
  return !!mem?.length
}

// POST /api/on-behalf — create a transaction in a friend's account, authored by me.
// Body: { on_behalf_of, amount, type, category, description?, date, receipt_url?,
//         trip_id?, split?: { title, participants: [{name,email?,amount}] } }
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (!body.on_behalf_of) return NextResponse.json({ error: 'Missing friend' }, { status: 400 })

  const resolved = await resolveFriendUserId(supabase, user.id, body.on_behalf_of)
  if (!resolved) return NextResponse.json({ error: 'This friend must be a registered user with a matching email' }, { status: 400 })

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const authorName = myProfile?.full_name || user.email?.split('@')[0] || 'A friend'
  const svc = service()

  // Only keep the trip if the friend is actually part of it
  let tripId: string | null = null
  if (body.trip_id && await friendInTrip(body.trip_id, resolved.friendId, resolved.email)) tripId = body.trip_id

  const payload: Record<string, unknown> = {
    user_id: resolved.friendId,
    created_by: user.id,
    amount: body.amount,
    type: body.type,
    category: body.category,
    description: body.description ? `${body.description} (added by ${authorName})` : `Added by ${authorName}`,
    date: body.date,
    is_recurring: false,
    is_discrete: false,
    receipt_url: body.receipt_url ?? null,
    trip_id: tripId,
  }

  const { data: tx, error } = await svc.from('transactions').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Optional split, authored by me, linked to the friend's transaction
  const parts = body.split?.participants as { name: string; email?: string; amount: number }[] | undefined
  if (parts?.length) {
    const { data: split, error: splitErr } = await svc.from('expense_splits').insert({
      title: body.split.title || body.description || body.category,
      total_amount: body.amount,
      category: body.category,
      description: body.description ?? null,
      date: body.date,
      trip_id: tripId,
      created_by: user.id,
    }).select().single()
    if (!splitErr && split) {
      const creatorEmail = (user.email ?? '').toLowerCase()
      await svc.from('split_participants').insert(parts.filter(p => p.name?.trim() && p.amount > 0).map(p => {
        const isCreator = !!p.email && p.email.toLowerCase() === creatorEmail
        return {
          split_id: split.id,
          participant_name: p.name.trim(),
          participant_email: p.email?.toLowerCase() ?? null,
          amount_owed: p.amount,
          is_paid: isCreator,
          paid_at: isCreator ? new Date().toISOString() : null,
        }
      }))
      await svc.from('transactions').update({ split_id: split.id }).eq('id', tx.id)
    }
  }

  return NextResponse.json(tx, { status: 201 })
}

// PUT /api/on-behalf?id=xxx — edit a transaction I authored for someone else.
export async function PUT(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const body = await request.json()

  const patch: Record<string, unknown> = {}
  for (const k of ['amount', 'type', 'category', 'description', 'date', 'receipt_url'] as const) {
    if (body[k] !== undefined) patch[k] = body[k]
  }
  // Only the author may edit (created_by must match)
  const { data, error } = await service()
    .from('transactions').update(patch).eq('id', id).eq('created_by', user.id).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found or not yours to edit' }, { status: 403 })
  return NextResponse.json(data[0])
}

// DELETE /api/on-behalf?id=xxx — delete a transaction I authored for someone else.
export async function DELETE(request: Request) {
  const { user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await service().from('transactions').delete().eq('id', id).eq('created_by', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
