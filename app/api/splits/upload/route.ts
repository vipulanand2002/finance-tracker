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

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${Date.now()}-${safeName}`
  const buffer = await file.arrayBuffer()

  const { data, error } = await supabase.storage
    .from('split-docs')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = supabase.storage.from('split-docs').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl, name: file.name })
}
