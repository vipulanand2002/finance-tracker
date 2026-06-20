'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, isToday, isYesterday } from 'date-fns'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface Message {
  id: string
  trip_id: string
  user_id: string
  sender_email: string
  content: string
  created_at: string
}

function msgTime(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
  return format(d, 'dd MMM, h:mm a')
}

function senderName(email: string) {
  return email.split('@')[0]
}

export default function TripChat({ tripId }: { tripId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const seenIds = useRef<Set<string>>(new Set())

  function appendMessages(incoming: Message[]) {
    const fresh = incoming.filter(m => {
      if (seenIds.current.has(m.id)) return false
      seenIds.current.add(m.id)
      return true
    })
    if (fresh.length > 0) {
      setMessages(prev => [...prev, ...fresh])
    }
  }

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })

    // Fetch history
    fetch(`/api/trip-messages?trip_id=${tripId}`)
      .then(r => r.json())
      .then((data: Message[]) => {
        if (Array.isArray(data)) {
          data.forEach(m => seenIds.current.add(m.id))
          setMessages(data)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Subscribe to live messages
    const channel = supabase
      .channel(`trip-chat-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_messages', filter: `trip_id=eq.${tripId}` },
        payload => appendMessages([payload.new as Message]),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    setSending(true)
    try {
      await fetch('/api/trip-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: tripId, content }),
      })
    } catch {
      setInput(content) // restore on failure
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 15rem)', minHeight: '320px' }}>
      {/* Message area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[false, true, false, true].map((right, i) => (
              <div key={i} className={`flex ${right ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className="h-10 w-2/3 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet — say hello!</p>
          </div>
        ) : (
          messages.map(msg => {
            const isOwn = msg.user_id === currentUserId
            return (
              <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted rounded-bl-sm'
                  }`}
                >
                  {!isOwn && (
                    <p className="text-[10px] font-semibold mb-0.5 opacity-60">
                      {senderName(msg.sender_email)}
                    </p>
                  )}
                  <p className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 px-1">{msgTime(msg.created_at)}</p>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 flex gap-2 shrink-0">
        <Input
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
          }}
          disabled={sending}
          className="flex-1"
          autoComplete="off"
        />
        <Button size="icon" onClick={sendMessage} disabled={!input.trim() || sending}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
