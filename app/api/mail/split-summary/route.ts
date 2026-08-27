import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { buildSplitReminderEmail } from '@/lib/email-templates/split-reminder'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-tracker.vercel.app'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'FinanceTracker <onboarding@resend.dev>'

// POST /api/mail/split-summary
// Body: { split_id: string }  — sends reminder emails to all unpaid participants who have an email
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured — add RESEND_API_KEY to Vercel env vars' }, { status: 503 })
  }

  const { split_id } = await request.json()
  if (!split_id) return NextResponse.json({ error: 'split_id required' }, { status: 400 })

  // Fetch the split + participants (must belong to this user)
  const { data: split, error } = await supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .eq('id', split_id)
    .eq('created_by', user.id)
    .single()

  if (error || !split) return NextResponse.json({ error: 'Split not found' }, { status: 404 })

  // Get creator display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const creatorName = profile?.full_name || user.email?.split('@')[0] || 'Someone'

  // Send to each unpaid participant that has an email
  const toNotify = (split.split_participants ?? []).filter(
    (p: { participant_email: string | null; is_paid: boolean }) =>
      !p.is_paid && p.participant_email
  )

  if (toNotify.length === 0) {
    return NextResponse.json({ error: 'No unpaid participants with email addresses found' }, { status: 400 })
  }

  let sent = 0
  const errors: string[] = []

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
      allParticipants: split.split_participants.map((p: {
        participant_name: string
        participant_email: string | null
        amount_owed: number
        is_paid: boolean
      }) => ({
        name: p.participant_name,
        email: p.participant_email ?? '',
        amount_owed: p.amount_owed,
        is_paid: p.is_paid,
      })),
      appUrl: APP_URL,
    })

    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: participant.participant_email,
      subject,
      html,
    })

    if (sendError) {
      console.error(`[mail/split-summary] Failed to send to ${participant.participant_email}:`, sendError)
      errors.push(participant.participant_email)
    } else {
      sent++
    }
  }

  if (sent === 0) {
    return NextResponse.json({ error: 'All emails failed to send' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    sent,
    failed: errors.length,
    ...(errors.length > 0 ? { failedEmails: errors } : {}),
  })
}
