import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ADMIN_EMAIL, approvalOf } from '@/lib/access'
import { serviceClient } from '@/lib/admin-server'
import { sendPushToUser } from '@/lib/push'

// POST /api/access/request — called by the "waiting for approval" page. Records that this
// account is asking for access (once) and tells the admin. Safe to call repeatedly.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const approval = approvalOf(user)
  if (approval === 'approved') return NextResponse.json({ approval })

  const meta = (user.app_metadata ?? {}) as Record<string, unknown>
  if (!meta.requested_at) {
    const svc = serviceClient()
    await svc.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, approval: approval === 'rejected' ? 'rejected' : 'pending', requested_at: new Date().toISOString() },
    })

    // Let the admin know in the app (push, if their device has it on)
    try {
      const { data: admin } = await svc.from('profiles').select('id').eq('email', ADMIN_EMAIL).maybeSingle()
      const who = (user.user_metadata?.full_name as string | undefined) || user.email || 'Someone'
      if (admin?.id) await sendPushToUser(admin.id, 'New access request', `${who} (${user.email}) wants to use Finance Tracker.`, '/admin')
    } catch { /* the request is still recorded */ }
  }

  return NextResponse.json({ approval })
}
