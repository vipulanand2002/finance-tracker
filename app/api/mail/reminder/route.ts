import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildConsolidatedReminderEmail } from '@/lib/email-templates/consolidated-reminder'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-tracker.vercel.app'

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD env vars are required')
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

type Participant = {
  participant_name: string
  participant_email: string | null
  amount_owed: number
  is_paid: boolean
}

type Split = {
  id: string
  title: string
  total_amount: number
  category: string
  date: string
  description: string | null
  reminder_count: number | null
  last_reminder_sent_at: string | null
  receipt_url: string | null
  split_participants: Participant[]
}

// Group splits by recipient email, collecting the split details + their share.
// Returns a Map<email, { name, splits[] }> ready for one consolidated email per person.
function groupByRecipient(
  splits: Split[],
  filterEmail: string | null
): Map<string, { name: string; splits: { split: Split; amountOwed: number }[] }> {
  const map = new Map<string, { name: string; splits: { split: Split; amountOwed: number }[] }>()

  for (const split of splits) {
    const unpaid = filterEmail
      ? split.split_participants.filter(p => !p.is_paid && p.participant_email?.toLowerCase() === filterEmail)
      : split.split_participants.filter(p => !p.is_paid && p.participant_email)

    for (const p of unpaid) {
      const email = p.participant_email!.toLowerCase()
      if (!map.has(email)) map.set(email, { name: p.participant_name, splits: [] })
      map.get(email)!.splits.push({ split, amountOwed: p.amount_owed })
    }
  }

  return map
}

// POST /api/mail/reminder
// Body: { type: 'contact', contact_id: string }
//     | { type: 'trip', trip_id: string }
// Sends ONE consolidated email per recipient listing ALL their pending splits.
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

  const body = await request.json()
  const { type, contact_id, trip_id } = body as {
    type: 'contact' | 'trip'
    contact_id?: string
    trip_id?: string
  }

  // Get creator display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const creatorName = user.user_metadata?.full_name || user.user_metadata?.name || profile?.full_name || user.email?.split('@')[0] || 'Someone'

  let splits: Split[] = []
  let targetEmail: string | null = null

  if (type === 'contact') {
    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })

    const { data: contact } = await supabase
      .from('contacts')
      .select('name, email')
      .eq('id', contact_id)
      .eq('user_id', user.id)
      .single()

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    if (!contact.email) return NextResponse.json({ error: 'no_email' }, { status: 400 })

    targetEmail = contact.email.toLowerCase()

    // Find all split IDs where this contact email is an unpaid participant
    const { data: participantRows } = await supabase
      .from('split_participants')
      .select('split_id')
      .eq('participant_email', targetEmail)
      .eq('is_paid', false)

    const splitIds = (participantRows ?? []).map((r: { split_id: string }) => r.split_id)
    if (splitIds.length === 0) {
      return NextResponse.json({ error: 'no_pending_splits' }, { status: 400 })
    }

    const { data: splitData } = await supabase
      .from('expense_splits')
      .select('id, title, total_amount, category, date, description, reminder_count, last_reminder_sent_at, receipt_url, split_participants(*)')
      .in('id', splitIds)
      .eq('created_by', user.id)

    splits = (splitData ?? []) as Split[]

  } else if (type === 'trip') {
    if (!trip_id) return NextResponse.json({ error: 'trip_id required' }, { status: 400 })

    const { data: splitData } = await supabase
      .from('expense_splits')
      .select('id, title, total_amount, category, date, description, reminder_count, last_reminder_sent_at, receipt_url, split_participants(*)')
      .eq('trip_id', trip_id)
      .eq('created_by', user.id)

    const all = (splitData ?? []) as Split[]
    splits = all.filter(s => s.split_participants.some(p => !p.is_paid && p.participant_email))

    if (splits.length === 0) {
      return NextResponse.json({ error: 'no_pending_splits' }, { status: 400 })
    }

  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Group splits by recipient so each person gets exactly one consolidated email
  const recipients = groupByRecipient(splits, targetEmail)

  if (recipients.size === 0) {
    return NextResponse.json({ error: 'no_pending_splits' }, { status: 400 })
  }

  // Look up registered names for ALL participants across all splits
  // (recipients + everyone else in the participant list shown in the mail)
  const allParticipantEmails = Array.from(new Set([
    ...Array.from(recipients.keys()),
    ...splits.flatMap(s =>
      s.split_participants
        .map(p => p.participant_email?.toLowerCase())
        .filter(Boolean) as string[]
    ),
  ]))

  const allRegisteredNames = new Map<string, string>()
  if (allParticipantEmails.length > 0) {
    const serviceClientNames = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: regProfiles } = await serviceClientNames
      .from('profiles')
      .select('email, full_name')
      .in('email', allParticipantEmails)
    for (const rp of regProfiles ?? []) {
      if (rp.full_name) allRegisteredNames.set(rp.email.toLowerCase(), rp.full_name)
    }
  }

  // Override each recipient's display name with their own registered name
  for (const [email, entry] of recipients) {
    const registered = allRegisteredNames.get(email)
    if (registered) entry.name = registered
  }

  const transporter = createTransporter()
  let sent = 0
  const errors: string[] = []
  // Track which split ids successfully had an email sent so we can update their counters
  const sentSplitIds = new Set<string>()

  type Attachment = { filename: string; content: Buffer; contentType: string }

  // Pre-fetch all unique receipts across splits so we don't re-download per recipient
  const receiptCache = new Map<string, Attachment>()
  for (const split of splits) {
    if (split.receipt_url && !receiptCache.has(split.receipt_url)) {
      try {
        const fileRes = await fetch(split.receipt_url)
        if (fileRes.ok) {
          const content = Buffer.from(await fileRes.arrayBuffer())
          const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
          const rawName = decodeURIComponent(split.receipt_url.split('/').pop() ?? 'attachment')
          const filename = rawName.replace(/^\d+-/, '')
          receiptCache.set(split.receipt_url, { filename, content, contentType })
        }
      } catch { /* continue without this attachment */ }
    }
  }

  for (const [email, { name, splits: recipientSplits }] of recipients) {
    // Collect attachments for this recipient's splits (deduplicated by URL)
    const attachments: Attachment[] = []
    const seenUrls = new Set<string>()
    for (const { split } of recipientSplits) {
      if (split.receipt_url && !seenUrls.has(split.receipt_url)) {
        seenUrls.add(split.receipt_url)
        const att = receiptCache.get(split.receipt_url)
        if (att) attachments.push(att)
      }
    }

    const { subject, html } = buildConsolidatedReminderEmail({
      recipientName: name,
      creatorName,
      splits: recipientSplits.map(({ split, amountOwed }) => ({
        title: split.title,
        total_amount: split.total_amount,
        category: split.category,
        date: split.date,
        description: split.description,
        amountOwed,
        allParticipants: split.split_participants.map(p => ({
          name: (p.participant_email && allRegisteredNames.get(p.participant_email.toLowerCase())) || p.participant_name,
          email: p.participant_email ?? '',
          amount_owed: p.amount_owed,
          is_paid: p.is_paid,
        })),
        reminderCount: (split.reminder_count ?? 0) + 1,
        lastSentAt: split.last_reminder_sent_at ?? null,
      })),
      appUrl: APP_URL,
    })

    try {
      await transporter.sendMail({
        from: `"FinanceTracker via ${creatorName}" <${gmailUser}>`,
        to: email,
        subject,
        html,
        ...(attachments.length > 0 ? { attachments } : {}),
      })
      sent++
      for (const { split } of recipientSplits) sentSplitIds.add(split.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[mail/reminder] Failed to send to ${email}:`, msg)
      errors.push(`${email}: ${msg}`)
    }
  }

  // Update reminder counters for all splits that had at least one email sent
  if (sentSplitIds.size > 0) {
    const now = new Date().toISOString()
    for (const splitId of sentSplitIds) {
      const split = splits.find(s => s.id === splitId)
      const newCount = (split?.reminder_count ?? 0) + 1
      supabase
        .from('expense_splits')
        .update({ reminder_count: newCount, last_reminder_sent_at: now })
        .eq('id', splitId)
        .then(() => {})
    }
  }

  if (sent === 0 && errors.length > 0) {
    return NextResponse.json({ error: `All emails failed: ${errors.join(' | ')}` }, { status: 500 })
  }

  if (sent === 0) {
    return NextResponse.json({ error: 'no_pending_splits' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    sent,
    failed: errors.length,
    ...(errors.length > 0 ? { failedEmails: errors } : {}),
  })
}
