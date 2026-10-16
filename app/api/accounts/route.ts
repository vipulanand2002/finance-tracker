import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeBalances, type Account, type AccountKind } from '@/lib/wallet-providers'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

const KINDS: AccountKind[] = ['wallet', 'bank', 'cash', 'other']

// Only these columns can be written from the client
function pickFields(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {}
  if (!partial || body.name !== undefined) out.name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!partial || body.kind !== undefined) out.kind = KINDS.includes(body.kind as AccountKind) ? body.kind : 'wallet'
  if (!partial || body.provider !== undefined) out.provider = typeof body.provider === 'string' && body.provider ? body.provider : null
  if (!partial || body.opening_balance !== undefined) {
    const n = Number(body.opening_balance)
    out.opening_balance = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }
  if (!partial || body.color !== undefined) out.color = typeof body.color === 'string' && body.color ? body.color : null
  if (!partial || body.notes !== undefined) out.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  if (body.is_archived !== undefined) out.is_archived = !!body.is_archived
  return out
}

// GET /api/accounts — the user's wallets & accounts with current balances.
// Reports { available: false } if migration 046 hasn't been applied yet, so the
// rest of the app keeps working.
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ available: false, accounts: [] })

  const ids = (accounts ?? []).map((a: Account) => a.id)
  if (ids.length === 0) return NextResponse.json({ available: true, accounts: [] })

  const [txRes, trRes] = await Promise.all([
    supabase.from('transactions').select('account_id, amount, type').eq('user_id', user.id).in('account_id', ids),
    supabase.from('account_transfers').select('from_account_id, to_account_id, amount').eq('user_id', user.id),
  ])
  if (txRes.error) return NextResponse.json({ error: txRes.error.message }, { status: 500 })
  if (trRes.error) return NextResponse.json({ error: trRes.error.message }, { status: 500 })

  return NextResponse.json({
    available: true,
    accounts: computeBalances(accounts as Account[], txRes.data ?? [], trRes.data ?? []),
  })
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fields = pickFields(await request.json(), false)
  if (!fields.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...fields, user_id: user.id })
    .select()
    .single()

  if (error) {
    if (error.message?.includes('accounts')) {
      return NextResponse.json({ error: 'Run migration 046 to enable wallets & accounts' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const fields = pickFields(await request.json(), true)
  if (fields.name !== undefined && !fields.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('accounts')
    .update(fields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/accounts?id=xxx — transactions keep existing (account_id → NULL);
// the account's transfers are removed with it.
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
