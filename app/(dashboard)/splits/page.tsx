'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Plus, CheckCircle2, Circle, Trash2, Users, Mail, Loader2, Pencil, Paperclip } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import SplitModal, { type EditingSplit } from '@/components/splits/SplitModal'
import type { Friend } from '@/types'

interface Participant {
  id: string
  participant_name: string
  participant_email: string | null
  amount_owed: number
  is_paid: boolean
  paid_at: string | null
}

interface Split {
  id: string
  created_by: string
  title: string
  total_amount: number
  category: string
  description: string | null
  date: string
  is_settled: boolean
  created_at: string
  trip_id?: string | null
  contact_id?: string | null
  receipt_url?: string | null
  card_id?: string | null
  reminder_count?: number | null
  last_reminder_sent_at?: string | null
  split_participants: Participant[]
}

export default function SplitsPage() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSplit, setEditingSplit] = useState<EditingSplit | null>(null)
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const [myId, setMyId] = useState<string>('')
  const [myEmail, setMyEmail] = useState<string>('')
  const [myDisplayName, setMyDisplayName] = useState<string>('')
  const [friends, setFriends] = useState<Friend[]>([])

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return
        setMyId(user.id)
        setMyEmail((user.email ?? '').toLowerCase())
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        setMyDisplayName(
          profile?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] || ''
        )
      })
    })
    fetch('/api/friends').then(r => r.json()).then(d => setFriends(Array.isArray(d) ? d : []))
  }, [])

  async function sendReminder(splitId: string, participantCount: number) {
    setSendingReminder(splitId)
    try {
      const res = await fetch('/api/mail/split-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split_id: splitId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      const n = data.sent ?? participantCount
      toast.success(`Reminder sent to ${n} participant${n !== 1 ? 's' : ''}!`)
      fetchSplits(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminder')
    } finally {
      setSendingReminder(null)
    }
  }

  const fetchSplits = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/splits')
      const data = await res.json()
      setSplits(Array.isArray(data) ? data : [])
    } catch {
      if (!silent) toast.error('Failed to load splits')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSplits() }, [fetchSplits])

  async function togglePaid(splitId: string, participantId: string, currentPaid: boolean) {
    try {
      await fetch(`/api/splits?id=${participantId}&type=participant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paid: !currentPaid, split_id: splitId }),
      })
      fetchSplits()
    } catch {
      toast.error('Failed to update')
    }
  }

  async function settle(splitId: string) {
    if (!confirm('Mark this split as fully settled?')) return
    try {
      await fetch(`/api/splits?id=${splitId}&type=settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      toast.success('Split settled!')
      fetchSplits()
    } catch {
      toast.error('Failed to settle')
    }
  }

  async function deleteSplit(id: string) {
    if (!confirm('Delete this split?')) return
    try {
      await fetch(`/api/splits?id=${id}`, { method: 'DELETE' })
      toast.success('Split deleted')
      fetchSplits()
    } catch {
      toast.error('Failed to delete')
    }
  }

  function daysAgo(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (diff <= 0) return 'today'
    if (diff === 1) return 'yesterday'
    return `${diff}d ago`
  }

  const active = splits.filter(s => !s.is_settled)
  const settled = splits.filter(s => s.is_settled)

  // Summary
  const totalOwedByOthers = active.reduce((sum, s) =>
    sum + s.split_participants.filter(p => !p.is_paid).reduce((s2, p) => s2 + p.amount_owed, 0), 0)

  // Build email → friend map once, outside the card render
  const friendByEmail = new Map<string, Friend>(
    friends.filter(f => f.email).map(f => [f.email!.toLowerCase(), f])
  )

  const SplitCard = ({ split }: { split: Split }) => {
    const paid = split.split_participants.filter(p => p.is_paid).length
    const total = split.split_participants.length
    const isCreator = myId && split.created_by === myId

    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{split.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(split.date + 'T00:00:00'), 'dd MMM yyyy')} · {split.category}
              {split.description && <> · {split.description}</>}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {split.receipt_url && (
              <a href={split.receipt_url} target="_blank" rel="noopener noreferrer" title="View attachment" className="text-muted-foreground hover:text-primary">
                <Paperclip className="w-3.5 h-3.5" />
              </a>
            )}
            <span className="font-bold text-sm">{formatCurrency(split.total_amount)}</span>
            {isCreator && !split.is_settled && (
              <>
                <button onClick={() => setEditingSplit(split as EditingSplit)} className="text-muted-foreground hover:text-foreground ml-1">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteSplit(split.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-2">
            {split.split_participants.map(p => {
              const emailLower = p.participant_email?.toLowerCase() ?? ''
              const isMe = !!emailLower && emailLower === myEmail
              const friend = emailLower ? friendByEmail.get(emailLower) : undefined

              // Name: own registered name → friend's contact name → participant_name
              const displayName = isMe
                ? (myDisplayName || p.participant_name)
                : friend
                  ? friend.name
                  : p.participant_name

              // Email: creator sees all; participant sees friend emails only (not strangers')
              const showEmail = isCreator
                ? !!p.participant_email
                : !!friend?.email

              const displayEmail = friend?.email ?? p.participant_email

              // Avatar: only if they're a friend with avatar_public enabled
              const avatarUrl = friend?.avatar_url ?? null
              const initial = displayName.charAt(0).toUpperCase()

              return (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => isCreator && !split.is_settled && togglePaid(split.id, p.id, p.is_paid)}
                    disabled={!isCreator || split.is_settled}
                    className="text-muted-foreground shrink-0"
                  >
                    {p.is_paid
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <Circle className="w-4 h-4" />}
                  </button>
                  {/* Avatar (shown when friend has shared their picture) */}
                  {avatarUrl ? (
                    <Avatar className="w-6 h-6 shrink-0">
                      <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                      <AvatarFallback className="text-[10px] font-semibold">{initial}</AvatarFallback>
                    </Avatar>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-sm truncate">{displayName}</p>
                    {showEmail && displayEmail && (
                      <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-medium ${p.is_paid ? 'text-emerald-600' : 'text-foreground'}`}>
                    {formatCurrency(p.amount_owed)}
                  </span>
                  <Badge variant={p.is_paid ? 'secondary' : 'outline'} className="text-xs">
                    {p.is_paid ? 'Paid' : 'Pending'}
                  </Badge>
                </div>
              </div>
              )
            })}
          </div>

          <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{paid}/{total} paid</span>
              {split.last_reminder_sent_at && (
                <span className="text-[10px] text-muted-foreground/70">
                  Reminded {daysAgo(split.last_reminder_sent_at)}
                  {(split.reminder_count ?? 0) > 1 ? ` · ×${split.reminder_count}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Creator-only actions */}
              {isCreator && !split.is_settled && split.split_participants.some(p => !p.is_paid && p.participant_email) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendReminder(
                    split.id,
                    split.split_participants.filter(p => !p.is_paid && p.participant_email).length
                  )}
                  disabled={sendingReminder === split.id}
                  className="text-xs h-7"
                >
                  {sendingReminder === split.id
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending…</>
                    : <><Mail className="w-3 h-3 mr-1" />Send Reminder</>
                  }
                </Button>
              )}
              {isCreator && !split.is_settled && paid === total && (
                <Button size="sm" variant="outline" onClick={() => settle(split.id)} className="h-7 text-xs">
                  Mark as settled
                </Button>
              )}
              {split.is_settled && <Badge className="text-xs bg-emerald-100 text-emerald-700">Settled</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Splits</h1>
          <p className="text-muted-foreground text-sm">Split expenses with friends and family</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Split
        </Button>
      </div>

      {/* Summary */}
      {active.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Others owe you</p>
              <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalOwedByOthers)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">across {active.length} active split{active.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Active splits</p>
              <p className="text-xl font-bold">{active.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{settled.length} settled</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : splits.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No splits yet. Split your first expense!</p>
            <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4 mr-1" />Create split</Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="settled">Settled ({settled.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {active.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No active splits</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {active.map(s => <SplitCard key={s.id} split={s} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settled" className="mt-4">
            {settled.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No settled splits yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {settled.map(s => <SplitCard key={s.id} split={s} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <SplitModal
        open={modalOpen || !!editingSplit}
        editingSplit={editingSplit}
        onClose={() => { setModalOpen(false); setEditingSplit(null) }}
        onSaved={fetchSplits}
      />
    </div>
  )
}
