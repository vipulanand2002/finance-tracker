import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { approvalOf } from '@/lib/access'

// GET /api/access/status — has this account been approved yet?
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ approval: approvalOf(user) }, { headers: { 'Cache-Control': 'no-store' } })
}
