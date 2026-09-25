'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Lightbulb, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

// Render lightweight markdown: **bold** → bold, leading "* "/"- " → bullets.
function renderRichText(text: string) {
  const withBullets = text.replace(/^[ \t]*[*-][ \t]+/gm, '• ')
  return withBullets.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

export default function InsightCards() {
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchInsights() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/insights')
      const data = await res.json()
      setInsights(data.insights ?? [])
    } catch {
      toast.error('Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInsights() }, [])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          AI Insights
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={fetchInsights}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : insights.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Add some transactions to get AI insights about your spending.
          </p>
        ) : (
          insights.map((insight, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/50">
              <span className="text-amber-500 text-sm shrink-0">✦</span>
              <p className="text-sm">{renderRichText(insight)}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
