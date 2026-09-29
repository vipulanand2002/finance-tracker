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

  // Tags: resolve each email to a contact in the FRIEND's account (create if
  // missing), so tagged people resolve on the friend's side. "Me" = the author.
  const tagEmails: string[] = Array.isArray(body.tag_emails)
    ? [...new Set((body.tag_emails as string[]).map(e => e?.toLowerCase()).filter(Boolean))]
    : []
  const registeredTags: { email: string; userId: string }[] = []  // tagged people who have accounts
  if (tagEmails.length > 0) {
    // Prefer each person's OWN profile name for the contact created in the
    // friend's account, so the friend sees real names (not my nicknames).
    const { data: profs } = await svc.from('profiles').select('id, email, full_name').in('email', tagEmails)
    const profileName = new Map<string, string>((profs ?? []).filter((p: { full_name: string | null }) => !!p.full_name).map((p: { email: string; full_name: string }) => [p.email.toLowerCase(), p.full_name]))
    for (const p of (profs ?? []) as { id: string; email: string }[]) {
      if (p.email.toLowerCase() !== resolved.email) registeredTags.push({ email: p.email.toLowerCase(), userId: p.id })
    }

    const friendContactIds: string[] = []
    for (const email of tagEmails) {
      if (email === resolved.email) continue // never tag the friend themselves
      const { data: existing } = await svc.from('contacts').select('id').eq('user_id', resolved.friendId).eq('email', email).maybeSingle()
      if (existing?.id) { friendContactIds.push(existing.id); continue }
      let name = profileName.get(email)
      if (!name) {
        // Fall back to my contact's name, then the email prefix
        const { data: myContact } = await supabase.from('contacts').select('name').eq('user_id', user.id).eq('email', email).maybeSingle()
        name = myContact?.name || email.split('@')[0]
      }
      const { data: created } = await svc.from('contacts').insert({ user_id: resolved.friendId, name, email }).select('id').single()
      if (created?.id) friendContactIds.push(created.id)
    }
    if (friendContactIds.length > 0) {
      payload.contact_id = friendContactIds[0]
      payload.contact_ids = friendContactIds
    }
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
      // The friend paid this bill (it's on their behalf), so THEIR share is
      // marked paid; you and everyone else still owe your shares.
      const payerEmail = resolved.email.toLowerCase()
      await svc.from('split_participants').insert(parts.filter(p => p.name?.trim() && p.amount > 0).map(p => {
        const isPayer = !!p.email && p.email.toLowerCase() === payerEmail
        return {
          split_id: split.id,
          participant_name: p.name.trim(),
          participant_email: p.email?.toLowerCase() ?? null,
          participant_user_id: isPayer ? resolved.friendId : null,
          amount_owed: p.amount,
          is_paid: isPayer,
          paid_at: isPayer ? new Date().toISOString() : null,
        }
      }))
      await svc.from('transactions').update({ split_id: split.id }).eq('id', tx.id)
    }
  } else if (registeredTags.length > 0) {
    // Plain (non-split) tagged transaction → mirror to each tagged person's
    // balance with the friend, just like a normal tagged transaction would.
    // income → 'payment' (they paid), expense → 'charge' (friend paid for them).
    try {
      const probe = await svc.from('tagged_payments').select('kind').limit(1)
      const hasKind = !probe.error
      const kind = body.type === 'income' ? 'payment' : 'charge'
      const { data: aProfile } = await svc.from('profiles').select('full_name').eq('id', resolved.friendId).single()
      const aName = aProfile?.full_name || resolved.email.split('@')[0]
      const rows = registeredTags.map(t => ({
        from_user_id: resolved.friendId,
        from_name: aName,
        from_email: resolved.email,
        to_email: t.email,
        to_user_id: t.userId,
        amount: body.amount,
        description: body.description ?? null,
        date: body.date,
        transaction_id: tx.id,
        status: 'pending',
        ...(hasKind ? { kind } : {}),
      }))
      if (rows.length > 0) await svc.from('tagged_payments').insert(rows)
    } catch { /* tagged_payments not migrated — ignore */ }
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
