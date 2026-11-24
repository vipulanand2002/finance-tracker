import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/admin-server'
import { AI_MODELS_IN_USE, listFlashModels, probeModels } from '@/lib/ai'

// GET /api/admin/ai-check — which Gemini models answer right now (admin only).
// Sends one tiny request (a few tokens) to each model the app uses, plus other flash models
// the key can see, so a busy / retired / limited model is obvious at a glance.
export const maxDuration = 60

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let available: string[] = []
  let listError: string | null = null
  try { available = await listFlashModels() } catch (e) { listError = e instanceof Error ? e.message.slice(0, 160) : 'could not list models' }

  // The models the app uses first, then up to 6 more flash models the key can see
  const inUse = [...AI_MODELS_IN_USE]
  const extra = available.filter(m => !inUse.includes(m)).slice(0, 6)
  const results = await probeModels([...inUse, ...extra])

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    inUse,
    results,
    listError,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
