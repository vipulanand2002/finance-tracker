'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Send, BrainCircuit } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// Render **bold** markdown as real bold; everything else stays literal text.
// (whitespace-pre-wrap on the container already preserves line breaks/lists.)
function renderRichText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

const SUGGESTIONS = [
  'How much did I spend on food last month?',
  'What is my biggest expense category?',
  'Am I on track with my budget?',
  'How does this month compare to last month?',
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI finance assistant. Ask me anything about your spending, budgets, or savings habits.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const message = text ?? input.trim()
    if (!message || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch {
      toast.error('Failed to get response')
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="w-5 h-5 text-primary" />
          AI Finance Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-xs">
                {m.role === 'user' ? 'U' : 'AI'}
              </AvatarFallback>
            </Avatar>
            <div
              className={`rounded-xl px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {renderRichText(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-xs">AI</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </CardContent>

      <div className="p-4 border-t space-y-3">
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="text-xs bg-muted hover:bg-muted/80 text-muted-foreground rounded-full px-3 py-1 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); sendMessage() }}
          className="flex gap-2"
        >
          <Input
            placeholder="Ask about your finances…"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </Card>
  )
}
