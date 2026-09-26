import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

type SupaClient = Awaited<ReturnType<typeof createClient>>
interface AuthUser { id: string; email?: string | null }

// When a transaction is tagged to contacts, mirror it into each tagged contact's
// account (if they're a registered user) so the balance reconciles on both sides:
//   income  → kind 'payment' (they paid you → reduces what they owe you)
//   expense → kind 'charge'  (you paid for them → increases what they owe you)
// Safe no-op if the tagged_payments table / kind column aren't migrated yet.
async function syncTaggedTransactions(
  supabase: SupaClient,
  user: AuthUser,
  tx: { id: string; amount: number; description: string | null; date: string; type: string },
  contactIds: string[],
) {
  try {
    // Always clear any prior records for this transaction first (edit/re-sync)
    await supabase.from('tagged_payments').delete().eq('transaction_id', tx.id).eq('from_user_id', user.id)
    if ((tx.type !== 'income' && tx.type !== 'expense') || contactIds.length === 0) return

    // Does the direction column exist? (added in migration 041)
    const probe = await supabase.from('tagged_payments').select('kind').limit(1)
    const hasKind = !probe.error
    // Pre-041 we can only represent "payment" (income). Skip expenses until migrated.
    if (tx.type === 'expense' && !hasKind) return

    const { data: contacts } = await supabase
      .from('contacts').select('id, name, email').in('id', contactIds).eq('user_id', user.id)
    const emails = (contacts ?? []).map((c: { email: string | null }) => c.email).filter(Boolean) as string[]
    if (emails.length === 0) return

    // Resolve which emails belong to registered users
    const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: profiles } = await service
      .from('profiles').select('id, email, full_name').in('email', emails.map(e => e.toLowerCase()))
    const byEmail = new Map<string, { id: string }>((profiles ?? []).map((p: { id: string; email: string }) => [p.email.toLowerCase(), p]))

    // Sender display name
    const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    const fromName = myProfile?.full_name || user.email?.split('@')[0] || 'A friend'
    const kind = tx.type === 'income' ? 'payment' : 'charge'

    const rows = (contacts ?? [])
      .filter((c: { email: string | null }) => c.email && byEmail.has(c.email.toLowerCase()))
      .map((c: { email: string | null }) => ({
        from_user_id: user.id,
        from_name: fromName,
        from_email: user.email ?? null,
        to_email: c.email!.toLowerCase(),
        to_user_id: byEmail.get(c.email!.toLowerCase())!.id,
        amount: tx.amount,
        description: tx.description,
        date: tx.date,
        transaction_id: tx.id,
        status: 'pending',
        ...(hasKind ? { kind } : {}),
      }))
    if (rows.length > 0) await supabase.from('tagged_payments').insert(rows)
  } catch {
    // tagged_payments table not migrated yet — ignore
  }
}

export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const category = searchParams.get('category')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')
  const tripId = searchParams.get('trip_id')
  const excludeCard = searchParams.get('exclude_card') === 'true'
  const cardId = searchParams.get('card_id')
  const hasCard = searchParams.get('has_card') === 'true'
  const contactId = searchParams.get('contact_id')

  // For trip-scoped queries: RLS handles visibility (own txs + trip participant txs)
  // For all other queries: restrict to own transactions only
  let query = tripId
    ? supabase.from('transactions').select('*, contacts(name, email)').eq('trip_id', tripId).order('created_at', { ascending: false })
    : supabase.from('transactions').select('*, contacts(name, email)').eq('user_id', user.id).order('created_at', { ascending: false })

  if (!tripId) {
    if (type && type !== 'all') query = query.eq('type', type)
    if (category) query = query.eq('category', category)
    if (from) query = query.gte('date', from)
    if (to) query = query.lte('date', to)
    if (search) query = query.ilike('description', `%${search}%`)
    // Exclude all card-related transactions (card imports + Card Payment entries)
    if (excludeCard) query = query.is('card_id', null).neq('category', 'Card Payment')
    // Filter to specific card or any card transaction
    if (cardId) query = query.eq('card_id', cardId)
    else if (hasCard) query = query.not('card_id', 'is', null)
    if (contactId) query = query.or(`contact_id.eq.${contactId},contact_ids.cs.{${contactId}}`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Explicit column list so unrecognised fields never reach Supabase
  // (contact_id / contact_ids require migration 039 — safe to include; Supabase ignores
  //  null values for missing columns and the migration adds them if not yet applied)
  const payload: Record<string, unknown> = {
    user_id: user.id,
    amount: body.amount,
    type: body.type,
    category: body.category,
    description: body.description ?? null,
    date: body.date,
    is_recurring: body.is_recurring ?? false,
    is_discrete: body.is_discrete ?? false,
    receipt_url: body.receipt_url ?? null,
    trip_id: body.trip_id ?? null,
    card_id: body.card_id ?? null,
    split_id: body.split_id ?? null,
  }
  // Only include contact columns once the schema has them (graceful degradation)
  if (body.contact_id !== undefined) payload.contact_id = body.contact_id ?? null
  if (body.contact_ids !== undefined) payload.contact_ids = body.contact_ids ?? []

  // First attempt with all fields; if schema cache error, retry without contact columns
  let { data, error } = await supabase.from('transactions').insert(payload).select().single()
  if (error?.message?.includes('contact_id')) {
    delete payload.contact_id
    delete payload.contact_ids
    ;({ data, error } = await supabase.from('transactions').insert(payload).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contactIds = [...new Set([...(body.contact_id ? [body.contact_id] : []), ...(Array.isArray(body.contact_ids) ? body.contact_ids : [])].filter(Boolean))] as string[]
  await syncTaggedTransactions(supabase, user, data, contactIds)

  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()

  // A transaction someone else added on your behalf can only be edited by its author.
  try {
    const { data: existing } = await supabase.from('transactions').select('created_by').eq('id', id).single()
    if (existing?.created_by && existing.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the person who added this can edit it.' }, { status: 403 })
    }
  } catch { /* created_by column not migrated yet — ignore */ }

  const patch: Record<string, unknown> = {
    amount: body.amount,
    type: body.type,
    category: body.category,
    description: body.description ?? null,
    date: body.date,
    is_recurring: body.is_recurring ?? false,
    is_discrete: body.is_discrete ?? false,
    receipt_url: body.receipt_url ?? null,
    trip_id: body.trip_id ?? null,
    card_id: body.card_id ?? null,
    split_id: body.split_id ?? null,
  }
  if (body.contact_id !== undefined) patch.contact_id = body.contact_id ?? null
  if (body.contact_ids !== undefined) patch.contact_ids = body.contact_ids ?? []

  let { data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single()
  if (error?.message?.includes('contact_id')) {
    delete patch.contact_id
    delete patch.contact_ids
    ;({ data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contactIds = [...new Set([...(body.contact_id ? [body.contact_id] : []), ...(Array.isArray(body.contact_ids) ? body.contact_ids : [])].filter(Boolean))] as string[]
  await syncTaggedTransactions(supabase, user, data, contactIds)

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const patch: Record<string, unknown> = {}
  if (body.split_id !== undefined) patch.split_id = body.split_id ?? null
  if (body.trip_id !== undefined) patch.trip_id = body.trip_id ?? null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to patch' }, { status: 400 })

  const { data, error } = await supabase.from('transactions').update(patch).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  // Delete ALL transactions for this user
  if (searchParams.get('all') === 'true') {
    const { error } = await supabase.from('transactions').delete().eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Only the author can delete a transaction added on your behalf.
  try {
    const { data: existing } = await supabase.from('transactions').select('created_by').eq('id', id).single()
    if (existing?.created_by && existing.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the person who added this can delete it.' }, { status: 403 })
    }
  } catch { /* created_by column not migrated yet — ignore */ }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Remove any cross-user "you paid me" records tied to this transaction
  try { await supabase.from('tagged_payments').delete().eq('transaction_id', id).eq('from_user_id', user.id) } catch { /* table not migrated */ }
  return NextResponse.json({ success: true })
}
