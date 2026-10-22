import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

// POST /api/push/test — sends a sample notification to the signed-in user's devices
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sent = await sendPushToUser(user.id, 'Notifications are on', 'This is how your reminders will look.', '/dashboard')
  if (sent === 0) return NextResponse.json({ error: 'No device is subscribed yet — turn notifications on first' }, { status: 400 })
  return NextResponse.json({ sent })
}
