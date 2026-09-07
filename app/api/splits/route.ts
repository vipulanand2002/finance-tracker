import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/splits             — all splits for the user
// GET /api/splits?trip_id=X   — splits linked to a specific trip
// GET /api/splits?contact_id=X — splits linked to a specific contact
export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const tripId = params.get('trip_id')
  const contactId = params.get('contact_id')

  let query = supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .order('date', { ascending: false })

  if (tripId) query = query.eq('trip_id', tripId)
  if (contactId) query = query.eq('contact_id', contactId)

  // RLS (split_creators_all + split_participants_view via is_split_participant)
  // now handles visibility by both user_id and email — single query suffices
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/splits — create split + participants + notifications
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { participants, card_id, ...splitData } = await request.json()

  const { data: split, error: splitError } = await supabase
    .from('expense_splits')
    .insert({ ...splitData, created_by: user.id })
    .select()
    .single()

  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 })

  const creatorEmail = (user.email ?? '').toLowerCase()

  if (participants?.length) {
    const { error: partError } = await supabase
      .from('split_participants')
      .insert(participants.map((p: { name: string; email?: string; amount: number; userId?: string }) => {
        const isCreator = !!p.email && p.email.toLowerCase() === creatorEmail
        return {
          split_id: split.id,
          participant_name: p.name,
          participant_email: p.email?.toLowerCase() ?? null,
          participant_user_id: p.userId ?? (isCreator ? user.id : null),
          amount_owed: p.amount,
          // Creator already paid their share when they paid the whole bill
          is_paid: isCreator,
          paid_at: isCreator ? new Date().toISOString() : null,
        }
      }))

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })

    // Notify other participants who have an email
    const toNotify = participants.filter(
      (p: { email?: string }) => p.email && p.email.toLowerCase() !== creatorEmail
    )
    if (toNotify.length > 0) {
      await supabase.from('split_notifications').insert(
        toNotify.map((p: { email: string; amount: number }) => ({
          split_id: split.id,
          split_title: split.title,
          total_amount: splitData.total_amount,
          creator_email: user.email,
          invitee_email: p.email.toLowerCase(),
          amount_owed: p.amount,
          dismissed: false,
        }))
      )

      // Fire push notifications + friend chat messages for participants with accounts
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Fetch creator's friendships once so we know who to message in chat
      const { data: friendships } = await serviceClient
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
      const friendIds = new Set((friendships ?? []).map((f: { friend_id: string }) => f.friend_id))

      for (const p of toNotify as { email: string; amount: number }[]) {
        const { data: profile } = await serviceClient
          .from('profiles')
          .select('id')
          .eq('email', p.email.toLowerCase())
          .single()
        if (profile?.id) {
          sendPushToUser(
            profile.id,
            `New split: ${split.title}`,
            `${user.email} added you. You owe ₹${p.amount}.`,
            '/splits'
          ).catch(() => {})

          // Auto-post a split card into the friend chat if this participant is a friend
          if (friendIds.has(profile.id)) {
            // Fire-and-forget: post a split card into the friend chat
            void serviceClient.from('messages').insert({
              sender_id: user.id,
              receiver_id: profile.id,
              content: `Split: ${split.title} — your share ₹${p.amount}`,
              type: 'split',
              split_id: split.id,
            })
          }
        }
      }
    }
  }

  // Always create a transaction — the creator paid the full bill regardless of whether
  // it's a trip split or a standalone split. split_id links it back for personal budget
  // calculations (excludes the full tx, uses participant share instead).
  const txPayload = {
    user_id: user.id,
    amount: splitData.total_amount,
    type: 'expense',
    category: splitData.category ?? 'Other',
    description: split.title,
    date: splitData.date,
    trip_id: splitData.trip_id ?? null,
    card_id: card_id ?? null,
    split_id: split.id,
  }

  const { error: txError } = await supabase.from('transactions').insert(txPayload)
  if (txError) {
    // Fallback: split_id column may not exist yet (migration 020 pending)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { split_id, ...txWithoutSplitId } = txPayload
    await supabase.from('transactions').insert(txWithoutSplitId)
  }

  return NextResponse.json(split, { status: 201 })
}

// PATCH /api/splits?id=xxx — mark participant as paid / settle split
export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const type = searchParams.get('type') // 'participant' | 'settle'

  const body = await request.json()

  if (type === 'participant') {
    const { error } = await supabase
      .from('split_participants')
      .update({ is_paid: body.is_paid, paid_at: body.is_paid ? new Date().toISOString() : null })
      .eq('id', id!)
      .eq('split_id', body.split_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (type === 'settle') {
    const { error } = await supabase
      .from('expense_splits')
      .update({ is_settled: true })
      .eq('id', id!)
      .eq('created_by', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// DELETE /api/splits?id=xxx
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { error } = await supabase
    .from('expense_splits')
    .delete()
    .eq('id', id!)
    .eq('created_by', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
