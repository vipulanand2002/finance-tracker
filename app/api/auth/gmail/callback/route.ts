import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const cookieStore = await cookies()
  const stored = cookieStore.get('gmail_oauth')?.value

  if (!stored || !code || !state) {
    return NextResponse.redirect(`${appUrl}/cards?gmail=error`)
  }

  let storedState: string, userId: string
  try {
    ({ state: storedState, userId } = JSON.parse(stored))
  } catch {
    return NextResponse.redirect(`${appUrl}/cards?gmail=error`)
  }

  if (state !== storedState) {
    return NextResponse.redirect(`${appUrl}/cards?gmail=error`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/auth/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()
  if (tokens.error) {
    return NextResponse.redirect(`${appUrl}/cards?gmail=error`)
  }

  // Get the Gmail address to display in UI
  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json()
  const gmailAddress = profile.emailAddress ?? null

  // Store tokens using service role (bypasses RLS — userId verified via state)
  const supabase = createServiceClient()
  await supabase.from('user_gmail_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
    gmail_address: gmailAddress,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  cookieStore.delete('gmail_oauth')
  return NextResponse.redirect(`${appUrl}/cards?gmail=connected`)
}
