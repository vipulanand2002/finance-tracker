import { createClient } from '@/lib/supabase/server'
import { chatWithFinanceAI } from '@/lib/gemini'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const from = ninetyDaysAgo.toISOString().split('T')[0]

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .or('card_id.is.null,category.eq.Card Payment')
    .gte('date', from)
    .order('date', { ascending: false })

  const response = await chatWithFinanceAI(message, transactions ?? [])
  return NextResponse.json({ response })
}
