import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/splits/upload
// Body: FormData with field "file" (PDF or image)
// Uploads to Supabase receipts bucket and returns { url, name }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const title = (formData.get('title') as string | null)?.trim() || ''
  const originalExt = file.name.includes('.') ? file.name.split('.').pop()! : ''

  // Build a human-readable filename from the split title; fall back to original filename
  const baseName = title
    ? title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
    : file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const friendlyName = originalExt ? `${baseName}.${originalExt}` : baseName

  // Timestamp prefix keeps the path unique even if the same title is reused
  const storagePath = `${user.id}/${Date.now()}-${friendlyName}`
  const buffer = await file.arrayBuffer()

  const { data, error } = await supabase.storage
    .from('split-docs')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('split-docs').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl, name: friendlyName })
}
