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

export default function FriendsSheet({ open, onClose }: Props) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
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
    if (!name.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      setFriends(prev => [data, ...prev])
      setName('')
      setEmail('')
      toast.success(`${data.name} added to friends`)
    } catch {
      toast.error('Failed to add friend')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string, friendName: string) {
    if (!confirm(`Remove ${friendName} from friends?`)) return
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
        </SheetHeader>

        <form onSubmit={handleAdd} className="space-y-2 mt-4">
          <Input placeholder="Name *" value={name} onChange={e => setName(e.target.value)} required />
          <Input type="email" placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} />
          <Button type="submit" disabled={adding} size="sm" className="w-full">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-1" />Add Friend</>}
          </Button>
        </form>

        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium">No friends yet</p>
            </div>
          ) : (
            friends.map(friend => (
              <div key={friend.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {friend.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{friend.name}</p>
                  {friend.email && <p className="text-xs text-muted-foreground truncate">{friend.email}</p>}
                </div>
                <button onClick={() => handleRemove(friend.id, friend.name)}
                  className="text-muted-foreground hover:text-destructive shrink-0 transition-colors">
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
