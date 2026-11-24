import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/cards/art-search?q=HDFC Infinia — pictures of a card from Google's image search
// (Programmable Search Engine, official API), so the user can pick one as their card's face.
//
// Needs two environment variables; without them it reports { note: 'not_configured' } and the
// app falls back to "paste an image link" / "upload a picture":
//   GOOGLE_CSE_API_KEY — an API key with "Custom Search API" enabled
//   GOOGLE_CSE_ID      — a Programmable Search Engine id with "Image search" on and
//                        "Search the entire web" on

interface ArtResult { thumb: string; url: string; title: string }

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.GOOGLE_CSE_API_KEY
  const cx = process.env.GOOGLE_CSE_ID
  if (!key || !cx) return NextResponse.json({ results: [], note: 'not_configured' })

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 3) return NextResponse.json({ results: [] })

  // "HDFC Infinia" → "HDFC Infinia credit card"
  const query = /card/i.test(q) ? q : `${q} credit card`
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}`
    + `&q=${encodeURIComponent(query)}&searchType=image&num=10&imgSize=large&safe=active`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return NextResponse.json({ results: [], note: res.status === 429 ? 'quota' : 'search_unavailable' })
    const data = await res.json() as { items?: { link?: string; title?: string; image?: { thumbnailLink?: string } }[] }

    const results: ArtResult[] = (data.items ?? [])
      .filter(i => i.link?.startsWith('https://') && i.image?.thumbnailLink)
      .map(i => ({ url: i.link!, thumb: i.image!.thumbnailLink!, title: (i.title ?? '').slice(0, 120) }))
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=600' } })
  } catch {
    return NextResponse.json({ results: [], note: 'search_unavailable' })
  }
}
