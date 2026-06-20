'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Check, X, Loader2 } from 'lucide-react'

interface Invitation {
  id: string
  trip_id: string
  trip_name: string
  inviter_email: string
  invitee_name: string | null
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export default function TripInvitationNotifier() {
  const [pending, setPending] = useState<Invitation[]>([])
  const [open, setOpen] = useState(false)
  const [responding, setResponding] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return

      // Fetch existing pending invitations on load
      fetch('/api/trip-invitations')
        .then(r => r.json())
        .then((data: Invitation[]) => {
          if (Array.isArray(data) && data.length > 0) {
            setPending(data)
            setOpen(true)
          }
        })
        .catch(() => {})

      // Subscribe for live new invitations
      channel = supabase
        .channel('trip-invitation-notifier')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'trip_invitations',
            filter: `invitee_email=eq.${user.email}`,
          },
          payload => {
            const inv = payload.new as Invitation
            setPending(prev => {
              if (prev.some(p => p.id === inv.id)) return prev
              return [inv, ...prev]
            })
            setOpen(true)
          },
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  async function respond(id: string, status: 'accepted' | 'declined') {
    setResponding(id)
    try {
      const res = await fetch(`/api/trip-invitations?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()

      setPending(prev => {
        const next = prev.filter(p => p.id !== id)
        if (next.length === 0) setOpen(false)
        return next
      })

      toast.success(status === 'accepted' ? "You've joined the trip!" : 'Invitation declined')
    } catch {
      toast.error('Failed to respond — try again')
    } finally {
      setResponding(null)
    }
  }

  if (pending.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Trip Invitation{pending.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            You have {pending.length} pending trip invitation{pending.length > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {pending.map(inv => (
            <div key={inv.id} className="rounded-lg border p-4 space-y-3">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{inv.trip_name}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">Pending</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Invited by{' '}
                  <span className="font-medium text-foreground">
                    {inv.inviter_email.split('@')[0]}
                  </span>
                  {' '}· {format(new Date(inv.created_at), 'dd MMM, h:mm a')}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => respond(inv.id, 'accepted')}
                  disabled={responding === inv.id}
                >
                  {responding === inv.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => respond(inv.id, 'declined')}
                  disabled={responding === inv.id}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
