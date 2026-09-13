import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('friend_requests')
    .select('id, from_user_id, from_name, from_email, created_at')
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PATCH /api/friend-requests
// Body: { id: string, action: 'accept' | 'reject' }
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await request.json() as { id: string; action: 'accept' | 'reject' }
  if (!id || !['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action (accept|reject) required' }, { status: 400 })
  }

  // Must be an incoming pending request for this user
  const { data: req, error: fetchErr } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('id', id)
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .single()

  if (fetchErr || !req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Update status
  await supabase
    .from('friend_requests')
    .update({ status: action === 'accept' ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
    .eq('id', id)

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get current user's display name and email for the notification
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const myName = myProfile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Someone'
  const myEmail = myProfile?.email || user.email || ''

  if (action === 'accept') {
    // Create friendship: B→A. Trigger auto-creates A→B.
    await serviceClient
      .from('friendships')
      .upsert(
        { user_id: user.id, friend_id: req.from_user_id },
        { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
      )

    // Auto-create a contact for the accepter (B) so A appears in their friends list
    if (req.from_email) {
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('email', req.from_email.toLowerCase())
        .maybeSingle()

      if (!existingContact) {
        await supabase
          .from('contacts')
          .insert({ user_id: user.id, name: req.from_name || req.from_email, email: req.from_email.toLowerCase() })
      }
    }

    // Notify the requester that their request was accepted
    await serviceClient.from('notifications').insert({
      user_id: req.from_user_id,
      type: 'friend_request_accepted',
      data: { from_name: myName, from_email: myEmail },
    })
  } else {
    // Notify the requester that their request was declined
    await serviceClient.from('notifications').insert({
      user_id: req.from_user_id,
      type: 'friend_request_rejected',
      data: { from_name: myName, from_email: myEmail },
    })
  }

  return NextResponse.json({ success: true })
}
