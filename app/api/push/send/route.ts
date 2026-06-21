import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/lib/push'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id, title, body, url } = await request.json()
  const sent = await sendPushToUser(user_id, title, body, url)
  return NextResponse.json({ sent })
}
