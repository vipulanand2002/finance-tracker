import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildConsolidatedReminderEmail } from '@/lib/email-templates/consolidated-reminder'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-tracker.vercel.app'

function createTransporter() {
  const user = process.env.BREVO_SMTP_USER
  const pass = process.env.BREVO_SMTP_KEY
  if (!user || !pass) throw new Error('BREVO_SMTP_USER and BREVO_SMTP_KEY env vars are required')
  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  })
}

function fromAddress(creatorName: string) {
  const addr = process.env.BREVO_FROM_EMAIL ?? process.env.BREVO_SMTP_USER ?? 'noreply@example.com'
  return `Finance Tracker (via ${creatorName}) <${addr}>`
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
  receipt_url_2: string | null
  receipt_name: string | null
  receipt_name_2: string | null
  created_by: string | null
  paid_by?: string | null
  split_participants: Participant[]
}

// Columns selected for every split lookup. paid_by is appended separately so we
// can fall back gracefully if that column hasn't been migrated yet.
const SPLIT_COLS = 'id, title, total_amount, category, date, description, reminder_count, last_reminder_sent_at, receipt_url, receipt_url_2, receipt_name, receipt_name_2, created_by, split_participants(*)'

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
  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_KEY) {
    return NextResponse.json(
      { error: 'Email service not configured — add BREVO_SMTP_USER and BREVO_SMTP_KEY to Vercel env vars' },
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

    const q1 = await supabase
      .from('expense_splits')
      .select(`${SPLIT_COLS}, paid_by`)
      .in('id', splitIds)
      .eq('created_by', user.id) as { data: Split[] | null; error: { message?: string } | null }
    let splitData = q1.data
    if (q1.error?.message?.includes('paid_by')) {
      const q2 = await supabase.from('expense_splits').select(SPLIT_COLS).in('id', splitIds).eq('created_by', user.id) as { data: Split[] | null }
      splitData = q2.data
    }

    splits = (splitData ?? []) as Split[]

  } else if (type === 'trip') {
    if (!trip_id) return NextResponse.json({ error: 'trip_id required' }, { status: 400 })

    const q1 = await supabase
      .from('expense_splits')
      .select(`${SPLIT_COLS}, paid_by`)
      .eq('trip_id', trip_id)
      .eq('created_by', user.id) as { data: Split[] | null; error: { message?: string } | null }
    let splitData = q1.data
    if (q1.error?.message?.includes('paid_by')) {
      const q2 = await supabase.from('expense_splits').select(SPLIT_COLS).eq('trip_id', trip_id).eq('created_by', user.id) as { data: Split[] | null }
      splitData = q2.data
    }

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

  // Never send a reminder to yourself — the sender can appear as an unpaid
  // participant on splits a friend paid (on-behalf), but you don't owe yourself.
  if (user.email) recipients.delete(user.email.toLowerCase())

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

  // Resolve the display name of every creditor (the person who actually paid a
  // split = paid_by ?? created_by). Your own splits are attributed to you; any
  // on-behalf split is attributed to the friend who fronted the bill. This feeds
  // the "who you owe" tally at the bottom of each reminder.
  const creditorNames = new Map<string, string>()
  const creditorEmailById = new Map<string, string>()
  creditorNames.set(user.id, creatorName)
  if (user.email) creditorEmailById.set(user.id, user.email.toLowerCase())
  const creditorIds = Array.from(new Set(
    splits.map(s => (s.paid_by || s.created_by || user.id)).filter(Boolean) as string[]
  )).filter(id => id !== user.id)
  if (creditorIds.length > 0) {
    const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: creditorProfiles } = await svc.from('profiles').select('id, full_name, email').in('id', creditorIds)
    for (const cp of creditorProfiles ?? []) {
      creditorNames.set(cp.id, cp.full_name || cp.email?.split('@')[0] || 'Someone')
      if (cp.email) creditorEmailById.set(cp.id, cp.email.toLowerCase())
    }
  }

  // Person token = email when known, else an id-based key. Netting keys both
  // directions (what R owes X, what X owes R) on the same token so they cancel.
  const tokenOf = (creditorId: string) => creditorEmailById.get(creditorId) ?? `id:${creditorId}`
  const nameByEmail = new Map(allRegisteredNames)
  if (user.email) nameByEmail.set(user.email.toLowerCase(), creatorName)
  for (const [id, nm] of creditorNames) {
    const em = creditorEmailById.get(id)
    if (em) nameByEmail.set(em, nm)
  }
  const nameOfToken = (token: string) =>
    token.startsWith('id:')
      ? creditorNames.get(token.slice(3)) ?? 'Someone'
      : nameByEmail.get(token) ?? token.split('@')[0]

  const transporter = createTransporter()
  let sent = 0
  const errors: string[] = []
  // Track which split ids successfully had an email sent so we can update their counters
  const sentSplitIds = new Set<string>()

  type Attachment = { filename: string; content: Buffer; contentType: string }

  // Pre-fetch all unique receipts across splits so we don't re-download per recipient
  const receiptCache = new Map<string, Attachment>()
  for (const split of splits) {
    const slots = [
      { url: split.receipt_url, customName: split.receipt_name },
      { url: split.receipt_url_2, customName: split.receipt_name_2 },
    ].filter(s => s.url) as { url: string; customName: string | null }[]
    const hasBoth = slots.length === 2
    for (let i = 0; i < slots.length; i++) {
      const { url, customName } = slots[i]
      if (!receiptCache.has(url)) {
        try {
          const fileRes = await fetch(url)
          if (fileRes.ok) {
            const content = Buffer.from(await fileRes.arrayBuffer())
            const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
            const rawName = decodeURIComponent(url.split('/').pop() ?? 'attachment')
            const ext = rawName.includes('.') ? rawName.split('.').pop() : ''
            const safeTitle = split.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
            const baseName = customName
              ? customName.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
              : hasBoth ? `${safeTitle}_${i + 1}` : safeTitle
            const filename = ext ? `${baseName}.${ext}` : baseName
            receiptCache.set(url, { filename, content, contentType })
          }
        } catch { /* continue without this attachment */ }
      }
    }
  }

  for (const [email, { name, splits: recipientSplits }] of recipients) {
    // Collect attachments for this recipient's splits (deduplicated by URL)
    const attachments: Attachment[] = []
    const seenUrls = new Set<string>()
    for (const { split } of recipientSplits) {
      const urls = [split.receipt_url, split.receipt_url_2].filter(Boolean) as string[]
      for (const url of urls) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url)
          const att = receiptCache.get(url)
          if (att) attachments.push(att)
        }
      }
    }

    // Balance tally per counterparty, scoped to THIS reminder's splits (not the
    // sender's whole account). For each person the recipient deals with here:
    //   youOwe   = recipient's unpaid shares on bills that person paid
    //   owedBack = that person's unpaid shares on bills the recipient paid
    //   net      = youOwe - owedBack  (positive => recipient still owes them)
    const round2 = (n: number) => Math.round(n * 100) / 100
    const oweTo = new Map<string, number>()   // recipient owes token
    const oweFrom = new Map<string, number>() // token owes recipient
    for (const s of splits) {
      const cToken = tokenOf((s.paid_by || s.created_by || user.id) as string)
      if (cToken === email) {
        // Recipient paid this bill — everyone else's unpaid share is owed to them.
        for (const p of s.split_participants) {
          const pe = p.participant_email?.toLowerCase()
          if (p.is_paid || !pe || pe === email) continue
          oweFrom.set(pe, (oweFrom.get(pe) ?? 0) + p.amount_owed)
        }
      } else {
        // Someone else paid — if the recipient has an unpaid share, they owe them.
        const rp = s.split_participants.find(p => !p.is_paid && p.participant_email?.toLowerCase() === email)
        if (rp) oweTo.set(cToken, (oweTo.get(cToken) ?? 0) + rp.amount_owed)
      }
    }
    const oweByPerson = Array.from(new Set([...oweTo.keys(), ...oweFrom.keys()]))
      .map(token => {
        const youOwe = round2(oweTo.get(token) ?? 0)
        const owedBack = round2(oweFrom.get(token) ?? 0)
        return { name: nameOfToken(token), youOwe, owedBack, net: round2(youOwe - owedBack) }
      })
      .filter(o => o.youOwe > 0.009 || o.owedBack > 0.009)
      .sort((a, b) => b.net - a.net)

    // Net amount this recipient actually has to pay out (sum of positive nets).
    // If they owe nothing net (they're square or owed money), skip the reminder.
    const netTotalDue = round2(oweByPerson.filter(o => o.net > 0).reduce((s, o) => s + o.net, 0))
    if (netTotalDue <= 0.009) continue

    // Transactions arranged by date (most recent first)
    const sortedRecipientSplits = [...recipientSplits]
      .sort((a, b) => (b.split.date ?? '').localeCompare(a.split.date ?? ''))

    const { subject, html } = buildConsolidatedReminderEmail({
      recipientName: name,
      creatorName,
      oweByPerson,
      amountDue: netTotalDue,
      splits: sortedRecipientSplits.map(({ split, amountOwed }) => ({
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
        from: fromAddress(creatorName),
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
