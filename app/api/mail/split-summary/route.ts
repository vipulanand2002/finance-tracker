import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildSplitReminderEmail } from '@/lib/email-templates/split-reminder'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-tracker.vercel.app'

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required')
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

// POST /api/mail/split-summary
// Body: { split_id: string } — sends reminder to all unpaid participants who have an email
export async function POST(request: Request) {
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: 'Email service not configured — add GMAIL_USER and GMAIL_APP_PASSWORD to Vercel env vars' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { split_id } = await request.json()
  if (!split_id) return NextResponse.json({ error: 'split_id required' }, { status: 400 })

  // Fetch the split + participants (must belong to this user)
  const { data: split, error } = await supabase
    .from('expense_splits')
    .select('*, split_participants(*), reminder_count, last_reminder_sent_at')
    .eq('id', split_id)
    .eq('created_by', user.id)
    .single()

  if (error || !split) return NextResponse.json({ error: 'Split not found' }, { status: 404 })

  // Get creator display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const creatorName = user.user_metadata?.full_name || user.user_metadata?.name || profile?.full_name || user.email?.split('@')[0] || 'Someone'

  // Send to each unpaid participant that has an email
  const toNotify = (split.split_participants ?? []).filter(
    (p: { participant_email: string | null; is_paid: boolean }) => !p.is_paid && p.participant_email
  )

  if (toNotify.length === 0) {
    return NextResponse.json(
      { error: 'No unpaid participants with email addresses found' },
      { status: 400 }
    )
  }

  // Look up registered names for ALL participants (not just recipients)
  // so the full participant list in the mail uses each person's own name
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const allEmails = (split.split_participants ?? [])
    .map((p: { participant_email: string | null }) => p.participant_email?.toLowerCase())
    .filter(Boolean) as string[]
  const { data: participantProfiles } = await serviceClient
    .from('profiles')
    .select('email, full_name')
    .in('email', allEmails)
  const registeredNames = new Map(
    (participantProfiles ?? []).map((p: { email: string; full_name: string | null }) => [p.email.toLowerCase(), p.full_name])
  )

  const prevReminderCount: number = split.reminder_count ?? 0
  const prevLastSentAt: string | null = split.last_reminder_sent_at ?? null
  const newReminderCount = prevReminderCount + 1

  // Fetch receipt attachments (up to 2)
  type Attachment = { filename: string; content: Buffer; contentType: string }
  const attachments: Attachment[] = []
  const receiptUrls = [split.receipt_url, split.receipt_url_2].filter(Boolean) as string[]
  for (const url of receiptUrls) {
    try {
      const fileRes = await fetch(url)
      if (fileRes.ok) {
        const content = Buffer.from(await fileRes.arrayBuffer())
        const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
        const rawName = decodeURIComponent(url.split('/').pop() ?? 'attachment')
        const ext = rawName.includes('.') ? rawName.split('.').pop() : ''
        const safeTitle = split.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
        const filename = safeTitle ? (ext ? `${safeTitle}.${ext}` : safeTitle) : rawName.replace(/^\d+-/, '')
        attachments.push({ filename, content, contentType })
      }
    } catch {
      // Continue without this attachment if fetch fails
    }
  }

  const transporter = createTransporter()
  let sent = 0
  const errors: string[] = []

  for (const participant of toNotify) {
    // Use recipient's own registered name if they have an account; fall back to what the creator saved
    const recipientEmail = participant.participant_email.toLowerCase()
    const recipientName = registeredNames.get(recipientEmail) || participant.participant_name

    const { subject, html } = buildSplitReminderEmail({
      recipientName,
      creatorName,
      split: {
        title: split.title,
        total_amount: split.total_amount,
        category: split.category,
        date: split.date,
        description: split.description,
      },
      amountOwed: participant.amount_owed,
      allParticipants: split.split_participants.map((p: {
        participant_name: string
        participant_email: string | null
        amount_owed: number
        is_paid: boolean
      }) => ({
        name: (p.participant_email && registeredNames.get(p.participant_email.toLowerCase())) || p.participant_name,
        email: p.participant_email ?? '',
        amount_owed: p.amount_owed,
        is_paid: p.is_paid,
      })),
      appUrl: APP_URL,
      reminderCount: newReminderCount,
      lastSentAt: prevLastSentAt,
    })

    try {
      await transporter.sendMail({
        from: `"FinanceTracker via ${creatorName}" <${gmailUser}>`,
        to: participant.participant_email,
        subject,
        html,
        ...(attachments.length > 0 ? { attachments } : {}),
      })
      sent++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[mail] Failed to send to ${participant.participant_email}:`, msg)
      errors.push(`${participant.participant_email}: ${msg}`)
    }
  }

  if (sent === 0) {
    return NextResponse.json({ error: `All emails failed: ${errors.join(' | ')}` }, { status: 500 })
  }

  // Record the send — fire and forget
  supabase
    .from('expense_splits')
    .update({ reminder_count: newReminderCount, last_reminder_sent_at: new Date().toISOString() })
    .eq('id', split_id)
    .then(() => {})

  return NextResponse.json({
    success: true,
    sent,
    failed: errors.length,
    reminderCount: newReminderCount,
    ...(errors.length > 0 ? { failedEmails: errors } : {}),
  })
}
