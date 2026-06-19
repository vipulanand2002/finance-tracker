'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { UserPlus, Trash2, Users, Loader2 } from 'lucide-react'
import type { Friend } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

function initials(email: string) {
  return email.charAt(0).toUpperCase()
}

export default function FriendsSheet({ open, onClose }: Props) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchFriends = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/friends')
      const data = await res.json()
      setFriends(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load friends')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchFriends()
  }, [open, fetchFriends])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error)
        return
      }
      setFriends(prev => [data, ...prev])
      setEmail('')
      toast.success(`${data.email} added to friends`)
    } catch {
      toast.error('Failed to add friend')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string, friendEmail: string) {
    if (!confirm(`Remove ${friendEmail} from friends?`)) return
    try {
      await fetch(`/api/friends?id=${id}`, { method: 'DELETE' })
      setFriends(prev => prev.filter(f => f.id !== id))
      toast.success('Friend removed')
    } catch {
      toast.error('Failed to remove friend')
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Friends
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Add friends by their email. If they have an account, they'll appear here for quick splits.
          </p>
        </SheetHeader>

        {/* Add friend form */}
        <form onSubmit={handleAdd} className="flex gap-2 mt-4">
          <Input
            type="email"
            placeholder="friend@gmail.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="flex-1"
            required
          />
          <Button type="submit" disabled={adding} size="sm" className="shrink-0">
            {adding
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><UserPlus className="w-4 h-4 mr-1" /> Add</>}
          </Button>
        </form>

        {/* Friends list */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-10 h-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No friends yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add a friend's email above to get started
                </p>
              </div>
            </div>
          ) : (
            friends.map(friend => (
              <div
                key={friend.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {initials(friend.email)}
                </div>
                <span className="flex-1 text-sm truncate">{friend.email}</span>
                <button
                  onClick={() => handleRemove(friend.id, friend.email)}
                  className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
                  title="Remove friend"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
