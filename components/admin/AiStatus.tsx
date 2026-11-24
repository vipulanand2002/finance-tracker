'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Probe { model: string; ok: boolean; status?: number | string; ms: number; note?: string }
interface Check { checkedAt: string; inUse: string[]; results: Probe[]; listError: string | null }

const MEANING: Record<string, string> = {
  '503': 'Google is overloaded right now',
  '429': 'this model’s free limit is used up',
  '404': 'model not available (retired)',
  '504': 'no answer in time',
  '403': 'key not allowed to use it',
  '400': 'request rejected',
}

// Admin: which Gemini models answer right now. Each check sends one tiny request per model.
export default function AiStatus() {
  const [check, setCheck] = useState<Check | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai-check', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setCheck(await res.json())
    } catch {
      toast.error('Could not run the check')
    } finally {
      setLoading(false)
    }
  }

  const working = check?.results.filter(r => r.ok) ?? []

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">AI status</CardTitle>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {check ? 'Check again' : 'Run check'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!check && !loading && (
          <p className="text-sm text-muted-foreground">
            Sends one tiny request (a few tokens) to each model the app uses, and a few others your key can see, to show which ones answer right now.
          </p>
        )}
        {check && (
          <>
            <p className="text-sm">
              {working.length > 0
                ? <><span className="font-medium text-emerald-600">{working.length} model{working.length !== 1 ? 's' : ''} answering.</span> Checked {format(new Date(check.checkedAt), 'h:mm:ss a')}.</>
                : <><span className="font-medium text-red-500">No model answered.</span> The AI service is down or over its limit for this key. Checked {format(new Date(check.checkedAt), 'h:mm:ss a')}.</>}
            </p>
            <ul className="divide-y rounded-lg border">
              {check.results.map(r => (
                <li key={r.model} className="flex items-start gap-3 px-3 py-2.5">
                  {r.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {r.model}
                      {check.inUse.includes(r.model) && <Badge variant="secondary" className="text-[10px]">used by the app</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.ok
                        ? `Answered in ${(r.ms / 1000).toFixed(1)} s`
                        : `${r.status}${MEANING[String(r.status)] ? ` — ${MEANING[String(r.status)]}` : ''}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {check.listError && <p className="text-xs text-muted-foreground">Couldn’t list other models: {check.listError}</p>}
            <p className="text-xs text-muted-foreground">
              If a model that isn’t used by the app is answering while the others fail, tell me its name and I’ll switch the app to it.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
