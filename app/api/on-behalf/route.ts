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

// POST /api/on-behalf — create a transaction in a friend's account, authored by me.
// Body: { on_behalf_of: contactId, amount, type, category, description?, date, receipt_url? }
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (!body.on_behalf_of) return NextResponse.json({ error: 'Missing friend' }, { status: 400 })

  const resolved = await resolveFriendUserId(supabase, user.id, body.on_behalf_of)
  if (!resolved) return NextResponse.json({ error: 'This friend must be a registered user with a matching email' }, { status: 400 })

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const authorName = myProfile?.full_name || user.email?.split('@')[0] || 'A friend'

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
  }

  const { data, error } = await service().from('transactions').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
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
