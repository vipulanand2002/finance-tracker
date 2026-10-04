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
  const contactEmail = params.get('contact_email')

  // If contact_email is supplied, find all split IDs where that email is a participant
  // (splits may not have contact_id set even when the person participated via email)
  let emailSplitIds: string[] = []
  if (contactEmail) {
    const { data: participantRows } = await supabase
      .from('split_participants')
      .select('split_id')
      .eq('participant_email', contactEmail.toLowerCase())
    emailSplitIds = (participantRows ?? []).map((r: { split_id: string }) => r.split_id)
  }

  let query = supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .order('date', { ascending: false })

  if (tripId) query = query.eq('trip_id', tripId)

  if (contactId && emailSplitIds.length > 0) {
    // Union: splits explicitly linked via contact_id OR where the email is a participant
    query = query.or(`contact_id.eq.${contactId},id.in.(${emailSplitIds.join(',')})`)
  } else if (contactId) {
    query = query.eq('contact_id', contactId)
  } else if (emailSplitIds.length > 0) {
    query = query.in('id', emailSplitIds)
  }

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

  const { participants, card_id, transaction_id, ...splitData } = await request.json()

  const { data: split, error: splitError } = await supabase
    .from('expense_splits')
    .insert({ ...splitData, card_id: card_id ?? null, created_by: user.id, receipt_url: splitData.receipt_url ?? null })
    .select()
    .single()

  if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 })

  const creatorEmail = (user.email ?? '').toLowerCase()

  if (participants?.length) {
    // Resolve user IDs for participants who have emails but no userId yet
    const serviceClientForIds = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const emailsToResolve = participants
      .filter((p: { email?: string; userId?: string }) => p.email && !p.userId && p.email.toLowerCase() !== creatorEmail)
      .map((p: { email?: string }) => p.email!.toLowerCase())

    const resolvedIds = new Map<string, string>()
    if (emailsToResolve.length > 0) {
      const { data: profileRows } = await serviceClientForIds
        .from('profiles')
        .select('id, email')
        .in('email', emailsToResolve)
      for (const row of profileRows ?? []) {
        resolvedIds.set(row.email.toLowerCase(), row.id)
      }
    }

    const { error: partError } = await supabase
      .from('split_participants')
      .insert(participants.map((p: { name: string; email?: string; amount: number; userId?: string }) => {
        const isCreator = !!p.email && p.email.toLowerCase() === creatorEmail
        const resolvedId = p.email ? resolvedIds.get(p.email.toLowerCase()) ?? null : null
        return {
          split_id: split.id,
          participant_name: p.name,
          participant_email: p.email?.toLowerCase() ?? null,
          participant_user_id: p.userId ?? (isCreator ? user.id : resolvedId),
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

  if (transaction_id) {
    // Split created FROM an existing transaction — link it; don't create a duplicate
    await supabase
      .from('transactions')
      .update({ split_id: split.id })
      .eq('id', transaction_id)
      .eq('user_id', user.id)
  } else {
    // Standalone split — create a transaction so the expense appears in the creator's history
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
      // Fallback: split_id column may not exist yet
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { split_id, ...txWithoutSplitId } = txPayload
      await supabase.from('transactions').insert(txWithoutSplitId)
    }
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

  // PATCH /api/splits?type=close_balance
  // Body: { contact_email: string | null, contact_name: string }
  // Marks all unpaid split shares for this person as paid;
  // auto-settles any split where all participants are now paid.
  if (type === 'close_balance') {
    const { contact_email, contact_name } = body as { contact_email: string | null; contact_name: string }

    // Get all unsettled splits created by this user
    const { data: userSplits } = await supabase
      .from('expense_splits')
      .select('id')
      .eq('created_by', user.id)
      .eq('is_settled', false)

    const splitIds = (userSplits ?? []).map((s: { id: string }) => s.id)
    if (splitIds.length === 0) return NextResponse.json({ markedPaid: 0 })

    // Find matching unpaid participants
    let participantQuery = supabase
      .from('split_participants')
      .select('id, split_id')
      .in('split_id', splitIds)
      .eq('is_paid', false)

    if (contact_email) {
      participantQuery = participantQuery.eq('participant_email', contact_email.toLowerCase())
    } else {
      participantQuery = participantQuery
        .ilike('participant_name', contact_name)
        .is('participant_email', null)
    }

    const { data: matched } = await participantQuery
    if (!matched?.length) return NextResponse.json({ markedPaid: 0 })

    const participantIds = matched.map((p: { id: string }) => p.id)
    const affectedSplitIds = [...new Set(matched.map((p: { split_id: string }) => p.split_id))]

    // Mark them all paid
    await supabase
      .from('split_participants')
      .update({ is_paid: true, paid_at: new Date().toISOString() })
      .in('id', participantIds)

    // Auto-settle any split where no unpaid participants remain
    for (const splitId of affectedSplitIds) {
      const { data: remaining } = await supabase
        .from('split_participants')
        .select('id')
        .eq('split_id', splitId)
        .eq('is_paid', false)

      if (!remaining?.length) {
        await supabase
          .from('expense_splits')
          .update({ is_settled: true })
          .eq('id', splitId)
          .eq('created_by', user.id)
      }
    }

    return NextResponse.json({ markedPaid: participantIds.length })
  }

  if (type === 'update') {
    const { participants, card_id, ...splitFields } = body as {
      participants: { name: string; email?: string; amount: number }[]
      card_id: string | null
      title: string
      total_amount: number
      category: string
      description: string | null
      date: string
      trip_id: string | null
      contact_id: string | null
      receipt_url: string | null
      receipt_url_2: string | null
      receipt_name: string | null
      receipt_name_2: string | null
    }

    // Update split metadata
    const { error: splitError } = await supabase
      .from('expense_splits')
      .update({
        title: splitFields.title,
        total_amount: splitFields.total_amount,
        category: splitFields.category,
        description: splitFields.description,
        date: splitFields.date,
        trip_id: splitFields.trip_id,
        contact_id: splitFields.contact_id,
        receipt_url: splitFields.receipt_url ?? null,
        receipt_url_2: splitFields.receipt_url_2 ?? null,
        receipt_name: splitFields.receipt_name ?? null,
        receipt_name_2: splitFields.receipt_name_2 ?? null,
        card_id: card_id ?? null,
      })
      .eq('id', id!)
      .eq('created_by', user.id)

    if (splitError) return NextResponse.json({ error: splitError.message }, { status: 500 })

    if (participants?.length) {
      const creatorEmail = (user.email ?? '').toLowerCase()

      // Who actually paid this bill (the creditor)? For a normal split that's
      // the creator; for an on-behalf split it's paid_by (the friend). Only the
      // payer's share is auto-marked paid — otherwise editing an on-behalf split
      // would keep re-marking the creator's own (unpaid) share as paid.
      // paid_by may not exist on un-migrated DBs → fall back to created_by.
      const { data: splitRow } = await supabase
        .from('expense_splits')
        .select('paid_by, created_by')
        .eq('id', id!)
        .single()
      const payerId = (splitRow?.paid_by as string | null) || (splitRow?.created_by as string | null) || user.id
      const payerIsCreator = payerId === user.id

      // Delete only unpaid participants — paid ones stay intact
      await supabase
        .from('split_participants')
        .delete()
        .eq('split_id', id!)
        .eq('is_paid', false)

      // Re-insert participants, skipping any whose email is already paid
      const { data: paidRows } = await supabase
        .from('split_participants')
        .select('participant_email')
        .eq('split_id', id!)
        .eq('is_paid', true)

      const paidEmails = new Set(
        (paidRows ?? []).map((r: { participant_email: string | null }) => r.participant_email?.toLowerCase() ?? '')
      )

      const toInsert = participants
        .filter(p => !p.email || !paidEmails.has(p.email.toLowerCase()))
        .map(p => {
          const isCreator = !!p.email && p.email.toLowerCase() === creatorEmail
          // Mark paid only if this participant is the payer. The creator counts
          // as payer only on a normal split (payerIsCreator); on an on-behalf
          // split the creator's share stays unpaid.
          const isPayer = isCreator && payerIsCreator
          return {
            split_id: id!,
            participant_name: p.name,
            participant_email: p.email?.toLowerCase() ?? null,
            participant_user_id: isCreator ? user.id : null,
            amount_owed: p.amount,
            is_paid: isPayer,
            paid_at: isPayer ? new Date().toISOString() : null,
          }
        })

      if (toInsert.length > 0) {
        const { error: partError } = await supabase.from('split_participants').insert(toInsert)
        if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })
      }
    }

    // Also update the linked transaction if it exists
    await supabase
      .from('transactions')
      .update({ amount: splitFields.total_amount, description: splitFields.title, category: splitFields.category, date: splitFields.date, trip_id: splitFields.trip_id, card_id: card_id ?? null })
      .eq('split_id', id!)
      .eq('user_id', user.id)

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

  // Only the creator can delete the split
  const { data: split } = await supabase.from('expense_splits').select('id').eq('id', id!).eq('created_by', user.id).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Not found or not yours to delete' }, { status: 403 })

  // Remove the transaction(s) linked to this split so it stops counting in
  // trip totals / dashboards. Service role covers on-behalf txns owned by others.
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await svc.from('transactions').delete().eq('split_id', id!)

  const { error } = await supabase
    .from('expense_splits')
    .delete()
    .eq('id', id!)
    .eq('created_by', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
