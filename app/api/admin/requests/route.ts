import { NextResponse } from 'next/server'
import { ADMIN_EMAIL, approvalOf, type Approval } from '@/lib/access'
import { getAdmin, serviceClient } from '@/lib/admin-server'

interface AccessUser {
  id: string
  email: string
  name: string
  provider: string
  approval: Approval
  created_at: string
  requested_at: string | null
  last_sign_in_at: string | null
}

// GET /api/admin/requests — everyone with an account, grouped by approval status (admin only)
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = serviceClient()
  const users: AccessUser[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const u of data.users) {
      if (u.email?.toLowerCase() === ADMIN_EMAIL) continue
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>
      users.push({
        id: u.id,
        email: u.email ?? '',
        name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || '',
        provider: (meta.provider as string) || 'email',
        approval: approvalOf(u),
        created_at: u.created_at,
        requested_at: (meta.requested_at as string) ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }
    if (data.users.length < 200) break
  }
  users.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return NextResponse.json({
    pending: users.filter(u => u.approval === 'pending'),
    rejected: users.filter(u => u.approval === 'rejected'),
    approved: users.filter(u => u.approval === 'approved'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/admin/requests  { id, action: 'approve' | 'reject' | 'revoke' }  (admin only)
export async function POST(request: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, action } = await request.json() as { id?: string; action?: string }
  if (!id || !['approve', 'reject', 'revoke'].includes(action ?? '')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const svc = serviceClient()
  const { data, error } = await svc.auth.admin.getUserById(id)
  if (error || !data.user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (data.user.email?.toLowerCase() === ADMIN_EMAIL) return NextResponse.json({ error: 'The admin account can’t be changed' }, { status: 400 })

  const approval: Approval = action === 'approve' ? 'approved' : 'rejected'
  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>
  const { error: upErr } = await svc.auth.admin.updateUserById(id, {
    app_metadata: {
      ...meta,
      approval,
      ...(approval === 'approved' ? { approved_at: new Date().toISOString() } : {}),
    },
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, approval })
}
