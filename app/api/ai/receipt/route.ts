import { createClient } from '@/lib/supabase/server'
import { extractReceiptData } from '@/lib/ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = file.type || 'image/jpeg'

  // Upload to Supabase Storage
  let receiptUrl: string | null = null
  try {
    const fileName = `${user.id}/${Date.now()}-${file.name}`
    const { data: uploadData } = await supabase.storage
      .from('receipts')
      .upload(fileName, buffer, { contentType: mimeType })

    if (uploadData) {
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(uploadData.path)
      receiptUrl = urlData.publicUrl
    }
  } catch {
    // Continue without storage if it fails
  }

  const extracted = await extractReceiptData(base64, mimeType)
  return NextResponse.json({ ...extracted, receiptUrl })
}
