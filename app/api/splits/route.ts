import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'
import { selectPairShares, splitsInvolving, fullyPaidSplitIds, type CloseSplit } from '@/lib/close-balance'

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

  // PATCH /api/splits?type=settle_many
  // Body: { ids: string[] } — settle several of MY splits at once. Any share that's
  // still unpaid is marked paid (so the balances reflect it), then the split is
  // marked settled. Splits that aren't mine or are already settled are skipped.
  if (type === 'settle_many') {
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
    if (ids.length === 0) return NextResponse.json({ error: 'No splits selected' }, { status: 400 })

    const { data: mineRows, error: mineErr } = await supabase
      .from('expense_splits').select('id').in('id', ids).eq('created_by', user.id).eq('is_settled', false)
    if (mineErr) return NextResponse.json({ error: mineErr.message }, { status: 500 })
    const mineIds = (mineRows ?? []).map((r: { id: string }) => r.id)
    if (mineIds.length === 0) return NextResponse.json({ settled: 0, sharesMarkedPaid: 0 })

    const { data: marked, error: payErr } = await supabase
      .from('split_participants')
      .update({ is_paid: true, paid_at: new Date().toISOString() })
      .in('split_id', mineIds)
      .eq('is_paid', false)
      .select('id')
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

    const { error: setErr } = await supabase
      .from('expense_splits').update({ is_settled: true }).in('id', mineIds).eq('created_by', user.id)
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 })

    return NextResponse.json({ settled: mineIds.length, sharesMarkedPaid: marked?.length ?? 0 })
  }

  // PATCH /api/splits?type=close_balance
  // Body: { contact_email: string | null, contact_name: string }
  // Settles the splits between YOU and this person, in both directions:
  //   • bills you paid       → their unpaid share is marked paid (they paid you)
  //   • bills they paid      → your unpaid share is marked paid (you paid them)
  // Shares on bills a THIRD party paid are left untouched — that debt isn't
  // between the two of you. Auto-settles splits where everyone is now paid.
  if (type === 'close_balance') {
    const { contact_email, contact_name } = body as { contact_email: string | null; contact_name: string }
    const email = contact_email?.trim().toLowerCase() || null

    // Their account id, if they have one (payers are stored by account id)
    let theirId: string | null = null
    if (email) {
      const { data: pr } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
      theirId = (pr as { id?: string } | null)?.id ?? null
    }

    const cols = 'id, created_by, split_participants(id, participant_name, participant_email, participant_user_id, is_paid)'
    // Payer columns need migrations 043/044 — fall back gracefully without them
    type Res = { data: CloseSplit[] | null; error: { message?: string } | null }
    let res = await supabase.from('expense_splits').select(`${cols}, paid_by, paid_by_email, paid_by_name`)
      .eq('created_by', user.id).eq('is_settled', false) as unknown as Res
    if (res.error) {
      res = await supabase.from('expense_splits').select(cols)
        .eq('created_by', user.id).eq('is_settled', false) as unknown as Res
    }
    const userSplits = res.data ?? []
    if (userSplits.length === 0) return NextResponse.json({ markedPaid: 0 })

    // Only the shares between YOU and this person (never a third party's bill)
    const pair = { userId: user.id, userEmail: user.email ?? '', email, name: contact_name ?? '', theirId }
    const matched = selectPairShares(userSplits, pair)

    // Mark them all paid
    if (matched.length > 0) {
      await supabase
        .from('split_participants')
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .in('id', matched.map(p => p.id))
    }

    // Auto-settle every split of theirs that's now fully paid — the ones just
    // closed (they were the last person left to pay, or the only person in it) and
    // any that were already fully paid but never got marked settled.
    const candidateIds = [...new Set([...matched.map(p => p.split_id), ...splitsInvolving(userSplits, pair)])]
    let settledSplits = 0
    if (candidateIds.length > 0) {
      const { data: fresh } = await supabase
        .from('expense_splits')
        .select('id, split_participants(is_paid)')
        .in('id', candidateIds)
        .eq('created_by', user.id)
        .eq('is_settled', false) as unknown as { data: { id: string; split_participants: { is_paid: boolean }[] }[] | null }
      const ready = fullyPaidSplitIds(fresh ?? [])
      if (ready.length > 0) {
        await supabase.from('expense_splits').update({ is_settled: true }).in('id', ready).eq('created_by', user.id)
        settledSplits = ready.length
      }
    }

    return NextResponse.json({ markedPaid: matched.length, settledSplits })
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

      // Who actually paid this bill (the creditor)? For a normal split that's the
      // creator; for an on-behalf split it's paid_by (a registered friend) or
      // paid_by_email (an unregistered contact). Only the payer's share is
      // auto-marked paid — otherwise editing would keep re-marking the creator's
      // own (unpaid) share as paid. Columns may not exist on un-migrated DBs.
      type PayerRow = { paid_by?: string | null; paid_by_email?: string | null; paid_by_name?: string | null; created_by?: string | null }
      let splitRow: PayerRow | null = null
      const pr = await supabase.from('expense_splits').select('paid_by, paid_by_email, paid_by_name, created_by').eq('id', id!).single() as { data: PayerRow | null; error: { message?: string } | null }
      if (pr.error?.message?.includes('paid_by')) {
        const pr2 = await supabase.from('expense_splits').select('paid_by, created_by').eq('id', id!).single() as { data: PayerRow | null }
        splitRow = pr2.data
      } else {
        splitRow = pr.data
      }
      const payerEmail = (splitRow?.paid_by_email ?? '').toLowerCase() || null
      // Name-only payer (no email) — matched by participant name instead.
      const payerName = !payerEmail && splitRow?.paid_by_name ? splitRow.paid_by_name.trim().toLowerCase() : null
      const payerIsCreator = !payerEmail && !payerName && (splitRow?.paid_by || splitRow?.created_by || user.id) === user.id

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
          // split the creator's share stays unpaid. An unregistered payer is
          // matched by email, or by name when they have no email.
          const isPayer = (isCreator && payerIsCreator)
            || (!!payerEmail && !!p.email && p.email.toLowerCase() === payerEmail)
            || (!!payerName && !p.email && p.name?.trim().toLowerCase() === payerName)
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
