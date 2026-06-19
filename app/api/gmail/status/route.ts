import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })

  const { data } = await supabase
    .from('user_gmail_tokens')
    .select('gmail_address, token_expiry, updated_at')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    connected: Boolean(data),
    gmailAddress: data?.gmail_address ?? null,
  })
}
