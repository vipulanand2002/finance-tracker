import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/account-transfers             — all of the user's transfers (newest first)
// GET /api/account-transfers?account_id=X — transfers into or out of one account
export async function GET(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(request.url).searchParams.get('account_id')

  let query = supabase
    .from('account_transfers')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (accountId) query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/account-transfers
// Body: { from_account_id?, to_account_id?, amount, date?, note? }
// Top-up = only to_account_id · withdrawal = only from_account_id · move = both.
// Transfers change account balances but are never income or expenses.
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const from = typeof body.from_account_id === 'string' && body.from_account_id ? body.from_account_id : null
  const to = typeof body.to_account_id === 'string' && body.to_account_id ? body.to_account_id : null
  const amount = Math.round(Number(body.amount) * 100) / 100

  if (!from && !to) return NextResponse.json({ error: 'Choose an account' }, { status: 400 })
  if (from && from === to) return NextResponse.json({ error: 'Pick two different accounts' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter an amount above zero' }, { status: 400 })

  // Both sides must be the caller's own accounts
  const ids = [from, to].filter(Boolean) as string[]
  const { data: owned, error: ownErr } = await supabase.from('accounts').select('id').eq('user_id', user.id).in('id', ids)
  if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 })
  if ((owned ?? []).length !== ids.length) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('account_transfers')
    .insert({
      user_id: user.id,
      from_account_id: from,
      to_account_id: to,
      amount,
      date: typeof body.date === 'string' && body.date ? body.date : new Date().toISOString().slice(0, 10),
      note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('account_transfers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
