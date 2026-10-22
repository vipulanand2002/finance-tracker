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

    // Signed in with Google from the Android app: Google runs in the phone's browser,
    // but the PKCE verifier lives in the app, so there is nothing to exchange here.
    // Hand the code back to the app through its deep link instead.
    const hasVerifier = cookieStore.getAll().some(c => c.name.includes('code-verifier'))
    if (!hasVerifier && /Android/i.test(request.headers.get('user-agent') ?? '')) {
      const link = `financetracker://auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
      const attr = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finance Tracker</title>
<style>body{font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}a{display:inline-block;margin-top:20px;background:#fafafa;color:#09090b;padding:14px 28px;border-radius:12px;font-weight:600;text-decoration:none}</style></head>
<body><div><h1 style="font-size:20px">Signed in</h1><p style="color:#a1a1aa">Returning to the Finance Tracker app…</p><a href="${attr}">Open the app</a></div>
<script>setTimeout(function(){location.href=${JSON.stringify(link).replace(/</g, '\\u003c')}},300)</script></body></html>`
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
    }
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
