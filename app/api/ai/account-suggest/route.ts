import { createClient } from '@/lib/supabase/server'
import { geminiText } from '@/lib/ai'
import { resolveKnown, sanitizeIdentity } from '@/lib/account-resolve'
import { findBank } from '@/lib/bank-logos'
import { NextResponse } from 'next/server'

// POST /api/ai/account-suggest  { text, role?: 'account' | 'bank' }
// Works out what kind of account the user is adding (wallet / bank / cash / other),
// which brand or bank it is, its website domain (for the logo) and brand colour.
// Names we already know are answered instantly without calling the model.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 80) : ''
  const role: 'account' | 'bank' = body.role === 'bank' ? 'bank' : 'account'
  if (text.length < 2) return NextResponse.json({ error: 'Too short' }, { status: 400 })

  // Instant path
  if (role === 'bank') {
    const bank = findBank(text)
    if (bank) return NextResponse.json({ identity: { kind: 'bank', provider: 'bank', institution: bank.institution, domain: bank.domain, color: null, needsInstitution: false, source: 'known' } })
  } else {
    const known = resolveKnown(text)
    // Only skip the model when we're sure; a bank with no bank named still benefits from nothing more
    if (known) return NextResponse.json({ identity: known })
  }

  const prompt = role === 'bank'
    ? `The user is adding a bank account to a personal-finance app (India) and typed the BANK name as: "${text}".`
    : `The user is adding an account to a personal-finance app (India) and typed its name as: "${text}".`

  try {
    const out = await geminiText(`${prompt}

Identify it. Return ONLY a JSON object, no other text:
{"kind":"wallet|bank|cash|other","institution":string|null,"domain":string|null,"color":string|null,"needsInstitution":boolean}

Rules:
- kind: "wallet" = prepaid/UPI wallets and meal, gift or fuel cards (Amazon Pay, Paytm, MobiKwik, Pluxee, Zeta, Zepto Cash…). "bank" = bank, savings, current, salary or deposit accounts. "cash" = physical cash. "other" = anything else (brokerage, loan, etc.).${role === 'bank' ? '\n- Since the user is naming a bank, kind must be "bank".' : ''}
- institution: the official brand or bank name, ONLY if the text clearly refers to one. Otherwise null.
- domain: that institution's main website domain, lowercase, no protocol or path (e.g. "hdfcbank.com"). If you are not certain it is correct, use null. Never invent a domain.
- color: the brand's primary colour as #RRGGBB, or null.
- needsInstitution: true only when kind is "bank" and the text doesn't say which bank.`, 0.1)

    const json = out.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const identity = sanitizeIdentity(JSON.parse(json))
    if (!identity) throw new Error('bad shape')
    if (role === 'bank') { identity.kind = 'bank'; identity.provider = 'bank'; identity.needsInstitution = false }
    return NextResponse.json({ identity })
  } catch (err) {
    console.error('[AI] account-suggest failed:', err instanceof Error ? err.message : err)
    // The form falls back to manual choice; nothing is lost
    return NextResponse.json({ identity: null })
  }
}
