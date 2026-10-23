'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Bug, CheckCircle2, Circle, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Severity = 'low' | 'medium' | 'high'

interface BugRow {
  id: string
  title: string
  details: string | null
  severity: Severity
  status: 'open' | 'fixed'
  created_at: string
  fixed_at: string | null
}

const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-red-500/10 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
}

// Admin-only notebook of bugs noticed in the app, so nothing gets forgotten.
export default function BugNotebook() {
  const [bugs, setBugs] = useState<BugRow[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'open' | 'fixed'>('open')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/bugs', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setAvailable(data.available !== false)
      setBugs(Array.isArray(data.bugs) ? data.bugs : [])
    } catch {
      toast.error('Could not load the bug notebook')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { Promise.resolve().then(load) }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, details, severity }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setBugs(prev => [data, ...prev])
      setTitle(''); setDetails(''); setSeverity('medium'); setFilter('open')
      toast.success('Bug noted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(b: BugRow, status: 'open' | 'fixed') {
    const prev = bugs
    setBugs(list => list.map(x => x.id === b.id ? { ...x, status, fixed_at: status === 'fixed' ? new Date().toISOString() : null } : x))
    const res = await fetch(`/api/admin/bugs?id=${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { setBugs(prev); toast.error('Could not update') }
  }

  async function remove(b: BugRow) {
    if (!confirm(`Delete “${b.title}”?`)) return
    const prev = bugs
    setBugs(list => list.filter(x => x.id !== b.id))
    const res = await fetch(`/api/admin/bugs?id=${b.id}`, { method: 'DELETE' })
    if (!res.ok) { setBugs(prev); toast.error('Could not delete') }
  }

  if (loading) return <Skeleton className="h-64" />

  if (!available) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <Bug className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="font-medium">The bug notebook isn’t set up yet</p>
          <p className="text-sm text-muted-foreground">Run <code>050_admin_bugs.sql</code> in the Supabase SQL editor, then reload this page.</p>
        </CardContent>
      </Card>
    )
  }

  const open = bugs.filter(b => b.status === 'open')
  const fixed = bugs.filter(b => b.status === 'fixed')
  const shown = filter === 'open' ? open : fixed

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Note a bug</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
            <Input placeholder="What’s wrong? e.g. Reminder email shows wrong total" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
            <Textarea placeholder="Where it happens, steps to reproduce, anything to remember (optional)" value={details} onChange={e => setDetails(e.target.value)} rows={3} />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {(['low', 'medium', 'high'] as const).map(s => (
                  <Button key={s} type="button" size="sm" variant={severity === s ? 'default' : 'outline'} className="capitalize" onClick={() => setSeverity(s)}>{s}</Button>
                ))}
              </div>
              <Button type="submit" disabled={saving || !title.trim()} className="ml-auto">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Add to notebook
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={filter === 'open' ? 'default' : 'outline'} onClick={() => setFilter('open')}>Open ({open.length})</Button>
          <Button size="sm" variant={filter === 'fixed' ? 'default' : 'outline'} onClick={() => setFilter('fixed')}>Fixed ({fixed.length})</Button>
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{filter === 'open' ? 'No open bugs — nice.' : 'Nothing marked fixed yet.'}</p>
        ) : (
          <ul className="space-y-2">
            {shown.map(b => (
              <li key={b.id} className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
                <button
                  type="button"
                  aria-label={b.status === 'open' ? 'Mark as fixed' : 'Reopen'}
                  className="mt-0.5 text-muted-foreground hover:text-primary shrink-0"
                  onClick={() => setStatus(b, b.status === 'open' ? 'fixed' : 'open')}
                >
                  {b.status === 'fixed' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Circle className="w-5 h-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn('text-sm font-medium', b.status === 'fixed' && 'line-through text-muted-foreground')}>{b.title}</p>
                    <Badge variant="secondary" className={cn('capitalize', SEVERITY_STYLE[b.severity])}>{b.severity}</Badge>
                  </div>
                  {b.details && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{b.details}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Noted {format(new Date(b.created_at), 'dd MMM yyyy')}
                    {b.fixed_at ? ` · fixed ${format(new Date(b.fixed_at), 'dd MMM yyyy')}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(b)} aria-label="Delete">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
