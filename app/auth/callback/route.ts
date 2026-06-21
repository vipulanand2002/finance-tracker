import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Supabase/Google sends ?error=... when OAuth fails — surface the real reason
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')
  if (oauthError) {
    console.error('[auth/callback] OAuth error:', oauthError, oauthErrorDesc)
    return NextResponse.redirect(
      `${origin}/login?error=auth-error&desc=${encodeURIComponent(oauthErrorDesc || oauthError)}`
    )
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error)
    return NextResponse.redirect(
      `${origin}/login?error=auth-error&desc=${encodeURIComponent(error.message)}`
    )
  }

  console.error('[auth/callback] No code in request. URL:', request.url)
  return NextResponse.redirect(`${origin}/login?error=auth-error&desc=no_code`)
}
