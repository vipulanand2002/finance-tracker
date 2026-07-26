import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// GET /api/categories — list active categories for this user.
// On first call (empty table), seeds all default expense + income categories.
export async function GET() {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_categories')
    .select('id, name, list_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // First use: seed all defaults so every category is editable/deletable
  if (!data || data.length === 0) {
    const defaults = [
      ...(EXPENSE_CATEGORIES as unknown as string[]).map(name => ({
        user_id: user.id, name, list_type: 'expense',
      })),
      ...(INCOME_CATEGORIES as unknown as string[]).map(name => ({
        user_id: user.id, name, list_type: 'income',
      })),
    ]
    const { data: seeded, error: seedError } = await supabase
      .from('user_categories')
      .insert(defaults)
      .select('id, name, list_type, created_at')
    if (seedError) return NextResponse.json({ error: seedError.message }, { status: 500 })
    return NextResponse.json(seeded ?? [])
  }

  return NextResponse.json(data)
}

// POST /api/categories — add a new category
export async function POST(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, list_type } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!['expense', 'income'].includes(list_type)) {
    return NextResponse.json({ error: 'list_type must be expense or income' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('user_categories')
    .insert({ user_id: user.id, name: name.trim(), list_type })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Category already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/categories?id=xxx — permanently remove a category
export async function DELETE(request: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('user_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
