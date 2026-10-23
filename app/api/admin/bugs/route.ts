import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/admin-server'

const SEVERITIES = ['low', 'medium', 'high']
const missingTable = (msg?: string) => !!msg && msg.includes('admin_bugs')

// Bug notebook — admin only. Needs migration 050 (admin_bugs); reports { available: false } until then.

export async function GET() {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await admin.supabase
    .from('admin_bugs')
    .select('*')
    .eq('user_id', admin.user.id)
    .order('created_at', { ascending: false })
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ available: false, bugs: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ available: true, bugs: data ?? [] })
}

export async function POST(request: Request) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return NextResponse.json({ error: 'Give the bug a short title' }, { status: 400 })

  const { data, error } = await admin.supabase
    .from('admin_bugs')
    .insert({
      user_id: admin.user.id,
      title,
      details: typeof body.details === 'string' && body.details.trim() ? body.details.trim().slice(0, 5000) : null,
      severity: SEVERITIES.includes(body.severity) ? body.severity : 'medium',
    })
    .select()
    .single()
  if (error) {
    if (missingTable(error.message)) return NextResponse.json({ error: 'Run migration 050_admin_bugs.sql in Supabase first' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/bugs?id=…  { title?, details?, severity?, status? }
export async function PATCH(request: Request) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await request.json()
  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 200)
  if (typeof body.details === 'string') patch.details = body.details.trim() ? body.details.trim().slice(0, 5000) : null
  if (SEVERITIES.includes(body.severity)) patch.severity = body.severity
  if (body.status === 'open' || body.status === 'fixed') {
    patch.status = body.status
    patch.fixed_at = body.status === 'fixed' ? new Date().toISOString() : null
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await admin.supabase.from('admin_bugs').update(patch).eq('id', id).eq('user_id', admin.user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await admin.supabase.from('admin_bugs').delete().eq('id', id).eq('user_id', admin.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
