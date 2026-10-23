'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Check, Loader2, RefreshCw, UserX, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export interface AccessUser {
  id: string
  email: string
  name: string
  provider: string
  approval: 'approved' | 'pending' | 'rejected'
  created_at: string
  requested_at: string | null
  last_sign_in_at: string | null
}

interface Lists { pending: AccessUser[]; rejected: AccessUser[]; approved: AccessUser[] }

export default function AccessRequests({ onPendingCount }: { onPendingCount?: (n: number) => void }) {
  const [lists, setLists] = useState<Lists | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/requests', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json() as Lists
      setLists(data)
      onPendingCount?.(data.pending.length)
    } catch {
      toast.error('Could not load access requests')
    }
  }, [onPendingCount])

  useEffect(() => { Promise.resolve().then(load) }, [load])

  async function act(u: AccessUser, action: 'approve' | 'reject' | 'revoke') {
    if (action === 'revoke' && !confirm(`Remove ${u.email}'s access? They’ll be signed out of the app until you approve them again.`)) return
    setBusy(u.id)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, action }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      toast.success(action === 'approve' ? `${u.email} approved` : action === 'reject' ? `${u.email} declined` : `${u.email}’s access removed`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  if (!lists) return <Skeleton className="h-48" />

  const row = (u: AccessUser, actions: React.ReactNode) => (
    <li key={u.id} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{u.name || u.email}</p>
        {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
        <p className="text-xs text-muted-foreground">
          {u.provider === 'google' ? 'Google' : 'Email'} · joined {format(new Date(u.created_at), 'dd MMM yyyy')}
          {u.requested_at ? ` · asked ${format(new Date(u.requested_at), 'dd MMM, h:mm a')}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </li>
  )

  const spinner = <Loader2 className="w-3.5 h-3.5 animate-spin" />

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Waiting for you <Badge variant="secondary">{lists.pending.length}</Badge></CardTitle></CardHeader>
        <CardContent className="p-0">
          {lists.pending.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No one is waiting. New sign-ups appear here.</p>
          ) : (
            <ul className="divide-y border-t">
              {lists.pending.map(u => row(u, <>
                <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => act(u, 'reject')}>{busy === u.id ? spinner : <UserX className="w-3.5 h-3.5 mr-1.5" />} Decline</Button>
                <Button size="sm" disabled={busy === u.id} onClick={() => act(u, 'approve')}>{busy === u.id ? spinner : <Check className="w-3.5 h-3.5 mr-1.5" />} Approve</Button>
              </>))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Approved users <Badge variant="secondary">{lists.approved.length}</Badge></CardTitle></CardHeader>
        <CardContent className="p-0">
          {lists.approved.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No one else has access yet.</p>
          ) : (
            <ul className="divide-y border-t">
              {lists.approved.map(u => row(u,
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy === u.id} onClick={() => act(u, 'revoke')}>
                  {busy === u.id ? spinner : <Undo2 className="w-3.5 h-3.5 mr-1.5" />} Remove access
                </Button>,
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {lists.rejected.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">Declined <Badge variant="secondary">{lists.rejected.length}</Badge></CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {lists.rejected.map(u => row(u,
                <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => act(u, 'approve')}>
                  {busy === u.id ? spinner : <Check className="w-3.5 h-3.5 mr-1.5" />} Approve
                </Button>,
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
