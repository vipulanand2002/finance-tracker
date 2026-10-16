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
  // Identified by AI from the name (migration 047)
  if (!partial || body.institution !== undefined) out.institution = typeof body.institution === 'string' && body.institution.trim() ? body.institution.trim().slice(0, 60) : null
  if (!partial || body.logo_domain !== undefined) {
    const d = typeof body.logo_domain === 'string' ? body.logo_domain.trim().toLowerCase() : ''
    out.logo_domain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
  }
  // What this account counts in (migration 048)
  if (!partial || body.include_in_total !== undefined) out.include_in_total = body.include_in_total !== false
  if (!partial || body.include_in_spending !== undefined) out.include_in_spending = body.include_in_spending !== false
  return out
}

// Columns added in migrations 047/048 — dropped (and the write retried) if not applied yet
const IDENTITY_COLS = ['institution', 'logo_domain', 'include_in_total', 'include_in_spending']
const isIdentityColError = (msg?: string) => !!msg && IDENTITY_COLS.some(c => msg.includes(c))
const withoutIdentity = (f: Record<string, unknown>) => Object.fromEntries(Object.entries(f).filter(([k]) => !IDENTITY_COLS.includes(k)))

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

  let { data, error } = await supabase
    .from('accounts')
    .insert({ ...fields, user_id: user.id })
    .select()
    .single()
  if (isIdentityColError(error?.message)) {
    ;({ data, error } = await supabase.from('accounts').insert({ ...withoutIdentity(fields), user_id: user.id }).select().single())
  }

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

  let { data, error } = await supabase
    .from('accounts')
    .update(fields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (isIdentityColError(error?.message)) {
    const rest = withoutIdentity(fields)
    if (Object.keys(rest).length === 0) return NextResponse.json({ error: 'Run migrations 047 and 048 to save this setting' }, { status: 400 })
    ;({ data, error } = await supabase.from('accounts').update(rest).eq('id', id).eq('user_id', user.id).select().single())
  }

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
