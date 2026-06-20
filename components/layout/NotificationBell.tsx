'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Bell, Check, X, Loader2, UserPlus, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCurrency } from '@/lib/utils'

interface TripInvitation {
  id: string
  trip_name: string
  inviter_email: string
  invitee_name: string | null
  status: 'pending'
  created_at: string
}

interface SplitNotification {
  id: string
  split_id: string
  split_title: string
  total_amount: number
  creator_email: string
  invitee_email: string
  amount_owed: number | null
  created_at: string
}

export default function NotificationBell() {
  const [tripInvites, setTripInvites] = useState<TripInvitation[]>([])
  const [splitNotifs, setSplitNotifs] = useState<SplitNotification[]>([])
  const [open, setOpen] = useState(false)
  const [responding, setResponding] = useState<string | null>(null)

  const totalCount = tripInvites.length + splitNotifs.length

  useEffect(() => {
    const supabase = createClient()
    let tripChannel: ReturnType<typeof supabase.channel> | null = null
    let splitChannel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return

      // Fetch initial data
      fetch('/api/trip-invitations').then(r => r.json()).then((d: TripInvitation[]) => {
        if (Array.isArray(d)) setTripInvites(d)
      }).catch(() => {})

      fetch('/api/split-notifications').then(r => r.json()).then((d: SplitNotification[]) => {
        if (Array.isArray(d)) setSplitNotifs(d)
      }).catch(() => {})

      // Realtime: new trip invitations
      tripChannel = supabase
        .channel('notif-trip-invites')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_invitations',
          filter: `invitee_email=eq.${user.email}`,
        }, payload => {
          const inv = payload.new as TripInvitation
          setTripInvites(prev => prev.some(p => p.id === inv.id) ? prev : [inv, ...prev])
        })
        .subscribe()

      // Realtime: new split notifications
      splitChannel = supabase
        .channel('notif-split-notifs')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'split_notifications',
          filter: `invitee_email=eq.${user.email}`,
        }, payload => {
          const n = payload.new as SplitNotification
          setSplitNotifs(prev => prev.some(p => p.id === n.id) ? prev : [n, ...prev])
        })
        .subscribe()
    })

    return () => {
      if (tripChannel) supabase.removeChannel(tripChannel)
      if (splitChannel) supabase.removeChannel(splitChannel)
    }
  }, [])

  async function respondToTrip(id: string, status: 'accepted' | 'declined') {
    setResponding(id)
    try {
      const res = await fetch(`/api/trip-invitations?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setTripInvites(prev => prev.filter(p => p.id !== id))
      toast.success(status === 'accepted' ? "You've joined the trip!" : 'Invitation declined')
    } catch {
      toast.error('Failed to respond')
    } finally {
      setResponding(null)
    }
  }

  async function dismissSplit(id: string) {
    setResponding(id)
    try {
      await fetch(`/api/split-notifications?id=${id}`, { method: 'PATCH' })
      setSplitNotifs(prev => prev.filter(p => p.id !== id))
    } catch {
      toast.error('Failed to dismiss')
    } finally {
      setResponding(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label={`Notifications${totalCount > 0 ? ` (${totalCount})` : ''}`}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
          <SheetHeader className="px-4 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4" />
              Notifications
              {totalCount > 0 && <Badge className="ml-1 text-xs">{totalCount}</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                <Bell className="w-10 h-10 opacity-20" />
                <p className="text-sm">No pending notifications</p>
              </div>
            ) : (
              <div className="divide-y">
                {/* Trip invitations */}
                {tripInvites.map(inv => (
                  <div key={inv.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <UserPlus className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          Trip invitation:{' '}
                          <span className="text-primary">{inv.trip_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          From{' '}
                          <span className="font-medium text-foreground">
                            {inv.inviter_email.split('@')[0]}
                          </span>
                          {' · '}
                          {format(new Date(inv.created_at), 'dd MMM, h:mm a')}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 pl-11">
                      <Button
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => respondToTrip(inv.id, 'accepted')}
                        disabled={responding === inv.id}
                      >
                        {responding === inv.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <><Check className="w-3.5 h-3.5 mr-1.5" />Accept</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8"
                        onClick={() => respondToTrip(inv.id, 'declined')}
                        disabled={responding === inv.id}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />Decline
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Split notifications */}
                {splitNotifs.map(n => (
                  <div key={n.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                        <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          Added to split:{' '}
                          <span className="text-primary">{n.split_title}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          From{' '}
                          <span className="font-medium text-foreground">
                            {n.creator_email.split('@')[0]}
                          </span>
                          {n.amount_owed != null && (
                            <> · You owe <span className="font-medium text-foreground">{formatCurrency(n.amount_owed)}</span></>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(n.created_at), 'dd MMM, h:mm a')}
                        </p>
                      </div>
                    </div>

                    <div className="pl-11">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full"
                        onClick={() => dismissSplit(n.id)}
                        disabled={responding === n.id}
                      >
                        {responding === n.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <>Dismiss</>}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
