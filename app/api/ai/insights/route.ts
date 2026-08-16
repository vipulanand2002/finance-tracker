import { createClient } from '@/lib/supabase/server'
import { analyzeSpending, getBudgetRecommendations } from '@/lib/groq'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'insights'

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const from = threeMonthsAgo.toISOString().split('T')[0]

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', from)
    .order('date', { ascending: false })

  const tx = transactions ?? []

  if (type === 'budget') {
    const budgetRecommendations = await getBudgetRecommendations(tx)
    return NextResponse.json({ budgetRecommendations })
  }

  const insights = await analyzeSpending(tx)
  return NextResponse.json({ insights })
}
