import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { fetchImageSafely } from '@/lib/safe-fetch'

// POST /api/cards/art
//   multipart: file=<image>      — a picture the user uploaded
//   json:      { url: "https://…" } — an image picked from the online search
// The picture is cropped to card proportions, compressed, and stored in the user's own
// folder; the returned public URL is saved on the card as `img:<url>`.

const MAX_UPLOAD = 8 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    let input: Buffer
    const type = request.headers.get('content-type') ?? ''
    if (type.includes('multipart/form-data')) {
      const file = (await request.formData()).get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'No image received' }, { status: 400 })
      if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'That file isn’t an image' }, { status: 400 })
      if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'Image is too large (max 8 MB)' }, { status: 400 })
      input = Buffer.from(await file.arrayBuffer())
    } else {
      const { url } = await request.json() as { url?: string }
      if (!url) return NextResponse.json({ error: 'No image link' }, { status: 400 })
      input = await fetchImageSafely(url)
    }

    // Card proportions (85.6 × 54 mm), modest size: sharp on screen, small to store
    const out = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize(960, 605, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()

    const path = `${user.id}/card-art/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { data, error } = await supabase.storage.from('split-docs').upload(path, out, { contentType: 'image/jpeg', upsert: false })
    if (error) return NextResponse.json({ error: 'Could not save the image' }, { status: 500 })

    const { data: pub } = supabase.storage.from('split-docs').getPublicUrl(data.path)
    return NextResponse.json({ url: pub.publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not use that image' }, { status: 400 })
  }
}
