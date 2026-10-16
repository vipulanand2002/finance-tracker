'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getProvider, providerLogoUrl, type Account, type AccountKind } from '@/lib/wallet-providers'
import { resolveKnown, type AccountIdentity } from '@/lib/account-resolve'
import { findBank } from '@/lib/bank-logos'
import { cn } from '@/lib/utils'
import AccountLogo from './AccountLogo'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Edit this account; omit to add a new one */
  account?: Account | null
}

const KIND_CHIPS: { kind: AccountKind; label: string }[] = [
  { kind: 'wallet', label: 'Wallet' },
  { kind: 'bank', label: 'Bank' },
  { kind: 'cash', label: 'Cash' },
  { kind: 'other', label: 'Other' },
]
const DEFAULT_COLOR: Record<AccountKind, string> = { wallet: '#64748B', bank: '#2563EB', cash: '#16A34A', other: '#64748B' }

// The identity an existing account already has (edit mode, before the name is touched)
function identityOf(a: Account): AccountIdentity {
  const p = getProvider(a.provider)
  return {
    kind: a.kind, provider: a.provider, color: a.color,
    institution: a.institution ?? (p && p.kind === 'wallet' ? p.label : null),
    domain: a.logo_domain ?? p?.domain ?? null,
    needsInstitution: false, source: 'known',
  }
}

async function askAI(text: string, role: 'account' | 'bank'): Promise<AccountIdentity | null> {
  try {
    const res = await fetch('/api/ai/account-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, role }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.identity as AccountIdentity | null) ?? null
  } catch { return null }
}

export default function AccountModal({ open, onClose, onSaved, account }: Props) {
  const [name, setName] = useState('')
  const [nameDirty, setNameDirty] = useState(false)       // user has typed a name this session
  const [kindOverride, setKindOverride] = useState<AccountKind | null>(null)
  const [bankText, setBankText] = useState<string | null>(null) // null = not edited, follow the name
  const [opening, setOpening] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  // AI answers, tagged with the text they answer so a stale reply is ignored
  const [aiName, setAiName] = useState<{ text: string; identity: AccountIdentity | null } | null>(null)
  const [aiBank, setAiBank] = useState<{ text: string; identity: AccountIdentity | null } | null>(null)
  const cache = useRef(new Map<string, AccountIdentity | null>())

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form each time the dialog opens */
    setName(account?.name ?? '')
    setNameDirty(false)
    setKindOverride(null)
    setBankText(null)
    setOpening(account ? String(account.opening_balance ?? '') : '')
    setNotes(account?.notes ?? '')
    setAiName(null)
    setAiBank(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, account])

  // ── What we know about the typed name ──────────────────────────────────────
  const trimmed = name.trim()
  const knownName = nameDirty ? resolveKnown(trimmed) : null
  const nameIdentity: AccountIdentity | null = nameDirty
    ? (knownName ?? (aiName && aiName.text === trimmed ? aiName.identity : null))
    : (account ? identityOf(account) : null)
  const detectingName = nameDirty && trimmed.length >= 3 && !knownName && !(aiName && aiName.text === trimmed)

  // Picking a different type than detected drops the detected brand
  const ident = nameIdentity && (kindOverride == null || kindOverride === nameIdentity.kind) ? nameIdentity : null
  const kind: AccountKind = kindOverride ?? ident?.kind ?? account?.kind ?? 'wallet'

  // Bank name box: follows the name until the user edits it
  const bankValue = bankText ?? (ident?.kind === 'bank' ? ident.institution ?? '' : '')
  const bankTrim = bankValue.trim()
  const bankDirty = bankText !== null
  const knownBank = bankDirty && bankTrim.length >= 2 ? findBank(bankTrim) : null
  const bankAnswer = aiBank && aiBank.text === bankTrim ? aiBank.identity : null
  const detectingBank = bankDirty && bankTrim.length >= 3 && !knownBank && aiBank?.text !== bankTrim
  const bankIdent: { institution: string | null; domain: string | null; color: string | null } | null =
    knownBank ? { institution: knownBank.institution, domain: knownBank.domain, color: null }
    : bankDirty ? (bankAnswer ? { institution: bankAnswer.institution, domain: bankAnswer.domain, color: bankAnswer.color } : null)
    : (ident?.kind === 'bank' ? { institution: ident.institution, domain: ident.domain, color: ident.color } : null)

  // ── Ask the AI for names we don't already know (debounced) ─────────────────
  useEffect(() => {
    if (!open || !nameDirty || trimmed.length < 3 || resolveKnown(trimmed)) return
    const key = `account:${trimmed.toLowerCase()}`
    let cancelled = false
    const t = setTimeout(async () => {
      const id = cache.current.has(key) ? cache.current.get(key)! : await askAI(trimmed, 'account')
      cache.current.set(key, id)
      if (!cancelled) setAiName({ text: trimmed, identity: id })
    }, 650)
    return () => { cancelled = true; clearTimeout(t) }
  }, [open, nameDirty, trimmed])

  useEffect(() => {
    if (!open || !bankDirty || bankTrim.length < 3 || findBank(bankTrim)) return
    const key = `bank:${bankTrim.toLowerCase()}`
    let cancelled = false
    const t = setTimeout(async () => {
      const id = cache.current.has(key) ? cache.current.get(key)! : await askAI(bankTrim, 'bank')
      cache.current.set(key, id)
      if (!cancelled) setAiBank({ text: bankTrim, identity: id })
    }, 650)
    return () => { cancelled = true; clearTimeout(t) }
  }, [open, bankDirty, bankTrim])

  // ── What gets saved & shown ────────────────────────────────────────────────
  const institution = kind === 'bank' ? (bankTrim || null) : (ident?.institution ?? null)
  const logoDomain = kind === 'bank' ? (bankIdent?.domain ?? null) : (ident?.domain ?? null)
  const color = (kind === 'bank' ? (bankIdent?.color ?? ident?.color) : ident?.color) ?? DEFAULT_COLOR[kind]
  const provider = kind === 'bank' ? 'bank' : kind === 'cash' ? 'cash' : (ident?.provider ?? (kind === 'wallet' ? 'other_wallet' : 'other'))
  const previewProvider = logoDomain ? null : (ident?.provider && providerLogoUrl(ident.provider) ? ident.provider : null)
  const detected = !!(institution || logoDomain || (nameDirty && ident))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) { toast.warning('Give the account a name'); return }
    const openingNum = opening.trim() === '' ? 0 : Number(opening)
    if (!Number.isFinite(openingNum)) { toast.warning('Enter a valid opening balance'); return }

    setSaving(true)
    try {
      const body = {
        name: trimmed, provider, kind, color,
        institution, logo_domain: logoDomain,
        opening_balance: openingNum, notes,
      }
      const res = await fetch(account ? `/api/accounts?id=${account.id}` : '/api/accounts', {
        method: account ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save')
      }
      toast.success(account ? 'Account updated' : 'Account added')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit account' : 'Add wallet or account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Name — everything else is worked out from this */}
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">What are you adding?</Label>
            <Input
              id="acc-name"
              autoFocus
              value={name}
              placeholder="e.g. Amazon Pay, HDFC salary account, Cash"
              onChange={e => { setNameDirty(true); setName(e.target.value) }}
            />
            {/* Live identification */}
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2 min-h-[52px] transition-colors',
                detected ? 'bg-muted/40' : 'border-dashed',
              )}
            >
              <AccountLogo provider={previewProvider} domain={logoDomain} kind={kind} color={color} size={32} />
              <div className="min-w-0 flex-1">
                {detectingName ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />Identifying…
                  </p>
                ) : detected ? (
                  <>
                    <p className="text-sm font-medium truncate">{institution ?? trimmed}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {nameDirty && <Sparkles className="w-3 h-3 text-primary" />}
                      {nameDirty ? 'Auto-detected' : 'Logo'} · {KIND_CHIPS.find(c => c.kind === kind)?.label}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {nameDirty && trimmed.length >= 3
                      ? 'Couldn’t identify this — pick a type below.'
                      : 'Type a name and we’ll find the logo and type for you.'}
                  </p>
                )}
              </div>
            </div>

            {/* Correct the guess if needed */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-xs text-muted-foreground mr-1">Type</span>
              {KIND_CHIPS.map(c => (
                <button
                  key={c.kind}
                  type="button"
                  onClick={() => setKindOverride(c.kind)}
                  className={cn(
                    'px-2.5 py-1 rounded-full border text-xs transition-colors',
                    kind === c.kind ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bank accounts: which bank? */}
          {kind === 'bank' && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-bank">Bank name</Label>
              <div className="flex items-center gap-2">
                <AccountLogo domain={bankIdent?.domain ?? null} kind="bank" color={bankIdent?.color ?? undefined} size={36} />
                <div className="relative flex-1">
                  <Input
                    id="acc-bank"
                    value={bankValue}
                    placeholder="e.g. HDFC Bank, SBI, Kotak"
                    onChange={e => setBankText(e.target.value)}
                  />
                  {detectingBank && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {bankIdent?.domain ? 'Logo found.' : 'Start typing the bank and we’ll find its logo.'}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="acc-opening">{account ? 'Opening balance' : 'Current balance'}</Label>
            <Input
              id="acc-opening"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={opening}
              placeholder="0"
              onChange={e => setOpening(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {account
                ? 'The balance before anything recorded here. Changing it shifts the current balance by the same amount.'
                : 'What’s in it right now. Expenses, income and top-ups you record will adjust it from here.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-notes">Notes (optional)</Label>
            <Textarea
              id="acc-notes"
              rows={2}
              value={notes}
              placeholder="Linked phone number, account ending, expiry…"
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {account ? 'Save' : 'Add account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
