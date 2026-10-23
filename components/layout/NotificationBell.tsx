'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, X, UserCheck, UserX, Loader2, IndianRupee, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
const TransactionModal = dynamic(() => import('@/components/transactions/TransactionModal'), { ssr: false })

interface TaggedPayment {
  id: string
  from_name: string | null
  from_email: string | null
  amount: number
  description: string | null
  date: string
  status: string
  kind?: string
  created_at: string
}

interface FriendRequest {
  id: string
  from_user_id: string
  from_name: string
  from_email: string
  created_at: string
}

// An update notice kept by the Android app (new build / new web version)
interface AppUpdateItem {
  kind: 'web' | 'apk'
  number: number
  title: string
  body: string
  path: string
  url: string
  time: number
}

interface AppNotification {
  id: string
  type: string
  data: { from_name?: string; from_email?: string }
  read: boolean
  created_at: string
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function NotificationBell() {
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const [payments, setPayments] = useState<TaggedPayment[]>([])
  const [addPayment, setAddPayment] = useState<TaggedPayment | null>(null)
  const [open, setOpen] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')
  // A newer Android build than the one installed (only when running inside the app)
  const [appUpdate, setAppUpdate] = useState<{ name: string; url: string; number: number } | null>(null)
  // Update notices the app has shown (kept in the app, newest first)
  const [updates, setUpdates] = useState<AppUpdateItem[]>([])
  const router = useRouter()
  // Don't list the same build twice (once from history, once from the live check)
  const showAppUpdate = !!appUpdate && !updates.some(u => u.kind === 'apk' && u.number >= appUpdate.number)

  const unreadCount = requests.length + notifs.filter(n => !n.read).length + payments.length + updates.length + (showAppUpdate ? 1 : 0)

  const readUpdates = useCallback(() => {
    try {
      const raw = window.AndroidApp?.getUpdates?.()
      if (raw) setUpdates(JSON.parse(raw) as AppUpdateItem[])
    } catch { /* older app build or bad data */ }
  }, [])

  const checkAppUpdate = useCallback(async () => {
    try {
      const raw = window.AndroidApp?.getState()
      if (!raw) return
      const installed = Number(JSON.parse(raw).build) || 0
      const res = await fetch('https://api.github.com/repos/vipulanand2002/finance-tracker/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      const rel = res.ok ? await res.json() : null
      const m = /vd+.d+.(d+)/.exec(rel?.tag_name ?? '')
      setAppUpdate(m && Number(m[1]) > installed ? { name: rel.name ?? rel.tag_name, url: rel.html_url, number: Number(m[1]) } : null)
    } catch { /* offline or rate-limited — try again next time */ }
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: reqs }, { data: ns }] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('id, from_user_id, from_name, from_email, created_at')
        .eq('to_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id, type, data, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setRequests(reqs ?? [])
    setNotifs(ns ?? [])

    // Cross-user "you paid / you owe" records addressed to me
    try {
      const pays = await fetch('/api/tagged-payments').then(r => r.ok ? r.json() : [])
      setPayments(Array.isArray(pays) ? pays.filter((p: TaggedPayment) => p.status === 'pending') : [])
    } catch { /* ignore */ }
  }, [])

  async function dismissPayment(p: TaggedPayment) {
    setProcessing(p.id)
    try {
      await fetch(`/api/tagged-payments?id=${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }),
      })
      setPayments(prev => prev.filter(x => x.id !== p.id))
    } catch { toast.error('Failed to dismiss') } finally { setProcessing(null) }
  }

  useEffect(() => {
    loadData()
    checkAppUpdate()
    readUpdates()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const channel = supabase
        .channel(`notif-bell-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'friend_requests',
          filter: `to_user_id=eq.${user.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'friend_requests',
          filter: `to_user_id=eq.${user.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, () => loadData())
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'tagged_payments',
          filter: `to_user_id=eq.${user.id}`,
        }, () => loadData())
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })
  }, [loadData, checkAppUpdate, readUpdates])

  async function handleAction(requestId: string, action: 'accept' | 'reject') {
    setProcessing(requestId)
    try {
      const res = await fetch('/api/friend-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, action }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'accept' ? 'Friend request accepted!' : 'Friend request declined')
      await loadData()
    } catch {
      toast.error('Action failed, please try again')
    } finally {
      setProcessing(null)
    }
  }

  async function markAllRead() {
    if (!userId || !notifs.some(n => !n.read)) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  const isEmpty = requests.length === 0 && notifs.length === 0 && payments.length === 0 && updates.length === 0 && !showAppUpdate

  return (
    <>
    <Sheet open={open} onOpenChange={o => { setOpen(o); if (o) { loadData(); checkAppUpdate(); readUpdates() } }}>
      <SheetTrigger className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Notifications">
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </SheetTrigger>

      <SheetContent side="right" className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0 shrink-0">
          <SheetTitle className="text-base">Notifications</SheetTitle>
          {notifs.some(n => !n.read) && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Bell className="w-8 h-8 opacity-20" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {/* ── New Android build available ── */}
              {/* ── Update notices from the app (new build / web update) ── */}
              {updates.length > 0 && (
                <div>
                  <div className="px-4 py-2 flex items-center justify-between bg-muted/40">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">App updates</p>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => { window.AndroidApp?.clearUpdates?.(); setUpdates([]) }}
                    >
                      Clear
                    </button>
                  </div>
                  {updates.map(u => (
                    <button
                      key={u.time}
                      type="button"
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                      onClick={() => {
                        if (u.path) { router.push(u.path); setOpen(false) }
                        else if (u.url) window.location.href = u.url
                      }}
                    >
                      <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                        <Download className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{u.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{u.body}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(u.time), { addSuffix: true })}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── New Android build available (live check) ── */}
              {showAppUpdate && appUpdate && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    App update
                  </p>
                  <div className="px-4 py-3 flex items-start gap-3 bg-primary/5">
                    <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                      <Download className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug"><span className="font-medium">{appUpdate.name}</span> is available</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Download it, then open the file to update the app.</p>
                      <Button size="sm" className="h-7 text-xs mt-2" onClick={() => { window.location.href = appUpdate.url }}>
                        Open download page
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Payment records (you paid / you owe) ── */}
              {payments.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    Payments
                  </p>
                  {payments.map(p => (
                    <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                        <IndianRupee className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">
                          <span className="font-medium">{p.from_name ?? p.from_email}</span>{' '}
                          {p.kind === 'charge' ? 'recorded that you owe them' : 'recorded that you paid them'}{' '}
                          <span className="font-semibold whitespace-nowrap">{formatCurrency(p.amount)}</span>
                          {p.kind === 'charge' && <span className="text-muted-foreground"> (they paid for you)</span>}
                        </p>
                        {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Counted in your balance · {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={processing === p.id} onClick={() => dismissPayment(p)}>
                            {processing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Dismiss'}
                          </Button>
                          <Button size="sm" className="h-7 text-xs" disabled={processing === p.id} onClick={() => { setAddPayment(p); setOpen(false) }}>
                            Add to my expenses
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Incoming friend requests ── */}
              {requests.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    Friend Requests
                  </p>
                  {requests.map(req => (
                    <div key={req.id} className="px-4 py-3 flex items-start gap-3">
                      <Avatar className="w-9 h-9 shrink-0 mt-0.5">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {initials(req.from_name || req.from_email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{req.from_name || req.from_email}</p>
                        {req.from_email && (
                          <p className="text-xs text-muted-foreground truncate">{req.from_email}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          wants to add you as a friend ·{' '}
                          {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={!!processing}
                            onClick={() => handleAction(req.id, 'reject')}
                          >
                            {processing === req.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />}
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={!!processing}
                            onClick={() => handleAction(req.id, 'accept')}
                          >
                            {processing === req.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />}
                            Accept
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Response notifications (accepted / rejected) ── */}
              {notifs.length > 0 && (
                <div>
                  {requests.length > 0 && (
                    <p className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                      Activity
                    </p>
                  )}
                  {notifs.map(n => {
                    const fromName = n.data?.from_name || n.data?.from_email || 'Someone'
                    const isAccepted = n.type === 'friend_request_accepted'
                    return (
                      <div
                        key={n.id}
                        className={`px-4 py-3 flex items-start gap-3 ${n.read ? '' : 'bg-primary/5'}`}
                      >
                        <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isAccepted ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {isAccepted ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">
                            <span className="font-medium">{fromName}</span>
                            {' '}
                            {isAccepted ? 'accepted your friend request' : 'declined your friend request'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!n.read && (
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Add a "you paid / you owe" record into my own expense ledger */}
    <TransactionModal
      open={!!addPayment}
      onClose={() => setAddPayment(null)}
      onSaved={async () => {
        if (addPayment) {
          try {
            await fetch(`/api/tagged-payments?id=${addPayment.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'added' }),
            })
          } catch { /* ignore */ }
        }
        setAddPayment(null)
        loadData()
      }}
      defaultType="expense"
      defaultAmount={addPayment?.amount}
      defaultDescription={addPayment ? `Paid ${addPayment.from_name ?? addPayment.from_email ?? ''}`.trim() : undefined}
    />
    </>
  )
}
