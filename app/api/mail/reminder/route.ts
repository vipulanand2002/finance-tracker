import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildSplitReminderEmail } from '@/lib/email-templates/split-reminder'

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
  split_participants: Participant[]
}

// POST /api/mail/reminder
// Body: { type: 'contact', contact_id: string }
//     | { type: 'trip', trip_id: string }
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
  const creatorName = profile?.full_name || user.email?.split('@')[0] || 'Someone'

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
      .select('id, title, total_amount, category, date, description, split_participants(*)')
      .in('id', splitIds)
      .eq('created_by', user.id)

    splits = (splitData ?? []) as Split[]

  } else if (type === 'trip') {
    if (!trip_id) return NextResponse.json({ error: 'trip_id required' }, { status: 400 })

    const { data: splitData } = await supabase
      .from('expense_splits')
      .select('id, title, total_amount, category, date, description, split_participants(*)')
      .eq('trip_id', trip_id)
      .eq('created_by', user.id)

    const all = (splitData ?? []) as Split[]
    // Only keep splits that have at least one unpaid participant with an email
    splits = all.filter(s =>
      s.split_participants.some(p => !p.is_paid && p.participant_email)
    )

    if (splits.length === 0) {
      return NextResponse.json({ error: 'no_pending_splits' }, { status: 400 })
    }

  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const transporter = createTransporter()
  let sent = 0
  const errors: string[] = []

  for (const split of splits) {
    const toNotify = targetEmail
      // contact mode: only remind this specific person
      ? split.split_participants.filter(p => !p.is_paid && p.participant_email?.toLowerCase() === targetEmail)
      // trip mode: remind all unpaid participants with emails
      : split.split_participants.filter(p => !p.is_paid && p.participant_email)

    for (const participant of toNotify) {
      const { subject, html } = buildSplitReminderEmail({
        recipientName: participant.participant_name,
        creatorName,
        split: {
          title: split.title,
          total_amount: split.total_amount,
          category: split.category,
          date: split.date,
          description: split.description,
        },
        amountOwed: participant.amount_owed,
        allParticipants: split.split_participants.map(p => ({
          name: p.participant_name,
          email: p.participant_email ?? '',
          amount_owed: p.amount_owed,
          is_paid: p.is_paid,
        })),
        appUrl: APP_URL,
      })

      try {
        await transporter.sendMail({
          from: `"FinanceTracker via ${creatorName}" <${gmailUser}>`,
          to: participant.participant_email!,
          subject,
          html,
        })
        sent++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[mail/reminder] Failed to send to ${participant.participant_email}:`, msg)
        errors.push(`${participant.participant_email}: ${msg}`)
      }
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
