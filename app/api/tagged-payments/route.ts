import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/tagged-payments — records where the current user is the payer (recipient
// of the notification), i.e. someone recorded that YOU paid them.
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = (user.email ?? '').toLowerCase()
  // RLS already restricts to rows addressed to this user; filter out own-sent rows.
  const { data, error } = await supabase
    .from('tagged_payments')
    .select('*')
    .or(`to_user_id.eq.${user.id}${email ? `,to_email.eq.${email}` : ''}`)
    .neq('from_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    // Table not migrated yet — behave as "none"
    return NextResponse.json([])
  }
  return NextResponse.json(data ?? [])
}

// PATCH /api/tagged-payments?id=xxx  { status: 'added' | 'dismissed' | 'pending', added_transaction_id? }
export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const body = await request.json()

  const patch: Record<string, unknown> = {}
  if (body.status) patch.status = body.status
  if (body.added_transaction_id !== undefined) patch.added_transaction_id = body.added_transaction_id ?? null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabase.from('tagged_payments').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
