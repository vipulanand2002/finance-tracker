import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isApproved } from '@/lib/access'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isPublicPage = isAuthPage || pathname.startsWith('/demo') || pathname.startsWith('/api/cron/') || pathname === '/api/version'

  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Signed in but not approved yet: only the "waiting for approval" page and the
  // access-request endpoints are reachable. Everything else (pages and API) is closed
  // so an unapproved account can't create data.
  if (user && !isApproved(user)) {
    const allowed = pathname === '/pending' || pathname.startsWith('/api/access/') || pathname.startsWith('/api/cron/') || pathname === '/api/version'
    if (!allowed) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'pending_approval' }, { status: 403 })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/pending'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (user && (isAuthPage || pathname === '/pending')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|manifest\\.(?:json|webmanifest)|sw\\.js|sw-push\\.js|\\.well-known|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
