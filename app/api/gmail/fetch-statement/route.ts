import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { geminiVision } from '@/lib/ai'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

async function getValidAccessToken(userId: string): Promise<string> {
  const service = createServiceClient()
  const { data: row } = await service
    .from('user_gmail_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!row) throw new Error('Gmail not connected. Please connect your Gmail account first.')

  const isExpired = row.token_expiry
    ? new Date(row.token_expiry) < new Date(Date.now() + 5 * 60 * 1000)
    : true

  if (!isExpired) return row.access_token

  if (!row.refresh_token) throw new Error('Session expired. Please reconnect your Gmail account.')

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })

  const newTokens = await refreshRes.json()
  if (newTokens.error) throw new Error('Failed to refresh Gmail session. Please reconnect.')

  await service.from('user_gmail_tokens').update({
    access_token: newTokens.access_token,
    token_expiry: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return newTokens.access_token
}

function findPdfPart(parts: any[]): { attachmentId: string; filename: string } | null {
  for (const part of parts ?? []) {
    if (part.filename?.toLowerCase().endsWith('.pdf') && part.body?.attachmentId) {
      return { attachmentId: part.body.attachmentId, filename: part.filename }
    }
    const nested = findPdfPart(part.parts ?? [])
    if (nested) return nested
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { senderEmail } = await request.json()
  if (!senderEmail) return NextResponse.json({ error: 'No sender email provided' }, { status: 400 })

  try {
    const accessToken = await getValidAccessToken(user.id)

    // Search Gmail for emails from the bank with PDF attachments
    const query = encodeURIComponent(`from:${senderEmail} has:attachment filename:pdf`)
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const searchData = await searchRes.json()

    if (!searchData.messages?.length) {
      return NextResponse.json(
        { error: `No statement emails found from ${senderEmail}. Make sure this is the correct sender address.` },
        { status: 404 }
      )
    }

    // Get the most recent message
    const messageId = searchData.messages[0].id
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const message = await msgRes.json()

    const pdfPart = findPdfPart(message.payload?.parts ?? [])
    if (!pdfPart) {
      return NextResponse.json({ error: 'No PDF attachment found in the email' }, { status: 404 })
    }

    // Download attachment data
    const attachRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${pdfPart.attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const attachData = await attachRes.json()

    // Gmail uses URL-safe base64 — convert to standard base64 for Gemini
    const base64 = attachData.data.replace(/-/g, '+').replace(/_/g, '/')

    const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].join(', ')

    const prompt = `You are a bank statement parser. This is a bank statement PDF. Extract ALL financial transactions.

For each transaction return a JSON object with:
- date: "YYYY-MM-DD" format
- description: merchant or transaction name (max 50 chars)
- amount: positive number only (no currency symbols)
- type: "income" for credits/deposits, "expense" for debits/withdrawals/payments
- category: best match from: ${allCategories}

Return ONLY a valid JSON array sorted by date descending. No explanation, no markdown, no code fences.`

    // Gemini reads the PDF bytes directly (real document understanding)
    const text = await geminiVision(prompt, base64, 'application/pdf')
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const transactions = JSON.parse(clean)

    return NextResponse.json({ transactions, filename: pdfPart.filename })
  } catch (err) {
    console.error('Gmail fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch statement' },
      { status: 500 }
    )
  }
}
