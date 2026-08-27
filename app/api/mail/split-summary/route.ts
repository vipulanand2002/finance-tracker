import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { buildSplitSummaryEmail } from '@/lib/email-templates/split-summary'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-tracker.vercel.app'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'FinanceTracker <onboarding@resend.dev>'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
  }

  // Fetch the user's profile for display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const userName = profile?.full_name || user.email?.split('@')[0] || 'there'
  const toEmail = user.email!

  // Fetch all splits the user created (with participants)
  const { data: splits, error } = await supabase
    .from('expense_splits')
    .select('*, split_participants(*)')
    .eq('created_by', user.id)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { subject, html } = buildSplitSummaryEmail({
    userName,
    userEmail: toEmail,
    splits: splits ?? [],
    appUrl: APP_URL,
  })

  const { data, error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject,
    html,
  })

  if (sendError) {
    console.error('[mail/split-summary] Resend error:', sendError)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, emailId: data?.id })
}
