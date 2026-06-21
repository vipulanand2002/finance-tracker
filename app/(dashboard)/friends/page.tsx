'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ArrowLeft,
  Send,
  Smile,
  Users,
  UserPlus,
  Loader2,
  SplitSquareVertical,
} from 'lucide-react'
import type { Friend, Message } from '@/types'

const EMOJI_ROWS = [
  ['😀', '😂', '😍', '🥰', '😊', '😎', '😅', '🤣'],
  ['👍', '👏', '🙏', '🤝', '💪', '👌', '✌️', '🤗'],
  ['❤️', '💕', '💯', '🔥', '✨', '🎉', '🙌', '👋'],
  ['😢', '😭', '😤', '😠', '🤔', '🤩', '😴', '🥹'],
  ['💸', '💰', '🍕', '🍺', '🎂', '🚗', '✈️', '🏠'],
]
const ALL_EMOJIS = EMOJI_ROWS.flat()

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [selected, setSelected] = useState<Friend | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [myId, setMyId] = useState('')
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [addEmail, setAddEmail] = useState('')
  const [addingFriend, setAddingFriend] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  // Bootstrap: current user + friends list
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setMyId(user.id)
    })
    loadFriends()
  }, [])

  async function loadFriends() {
    const res = await fetch('/api/friends')
    const d = await res.json()
    setFriends(Array.isArray(d) ? d : [])
  }

  // Load messages when conversation changes
  useEffect(() => {
    if (!selected) return
    setLoadingMsgs(true)
    setMessages([])
    fetch(`/api/messages?friend_id=${selected.friend_id}`)
      .then(r => r.json())
      .then(d => setMessages(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoadingMsgs(false))
  }, [selected])

  // Supabase Realtime — receive new messages in real time
  useEffect(() => {
    if (!myId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`friend-messages-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev => {
            // Only append if it belongs to the active conversation and isn't already there
            const inConv = selected &&
              ((msg.sender_id === myId && msg.receiver_id === selected.friend_id) ||
               (msg.sender_id === selected.friend_id && msg.receiver_id === myId))
            if (!inConv) return prev
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myId, selected])

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close emoji picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function openChat(friend: Friend) {
    setSelected(friend)
    setMobileView('chat')
    setShowEmoji(false)
    setInput('')
  }

  async function sendMessage() {
    if (!input.trim() || !selected || !myId || sending) return
    const content = input.trim()
    setInput('')
    setShowEmoji(false)
    setSending(true)

    // Optimistic bubble
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      sender_id: myId,
      receiver_id: selected.friend_id,
      content,
      type: 'text',
      split_id: null,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: selected.friend_id, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setMessages(prev => prev.map(m => m.id === tempId ? data : m))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      toast.error('Message failed to send')
    } finally {
      setSending(false)
    }
  }

  async function addFriend() {
    if (!addEmail.trim() || addingFriend) return
    setAddingFriend(true)
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail.trim() }),
    })
    const d = await res.json()
    if (res.ok) {
      toast.success('Friend added!')
      setAddEmail('')
      setFriends(prev => [d, ...prev])
    } else {
      toast.error(d.error ?? 'Failed to add friend')
    }
    setAddingFriend(false)
  }

  function insertEmoji(emoji: string) {
    setInput(prev => prev + emoji)
    inputRef.current?.focus()
  }

  return (
    <div
      className="-m-4 md:-m-6 flex overflow-hidden"
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      {/* ── Friends list panel ── */}
      <div className={cn(
        'flex flex-col border-r bg-card',
        'w-full sm:w-72 shrink-0',
        mobileView === 'chat' ? 'hidden sm:flex' : 'flex'
      )}>
        {/* Add friend */}
        <div className="p-3 border-b space-y-2">
          <p className="text-sm font-semibold px-0.5">Friends</p>
          <div className="flex gap-1.5">
            <Input
              placeholder="Add by email…"
              value={addEmail}
              onChange={e => setAddEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFriend()}
              className="h-8 text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={addFriend}
              disabled={addingFriend || !addEmail.trim()}
            >
              {addingFriend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Friend rows */}
        <div className="flex-1 overflow-y-auto">
          {friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground text-sm px-4 text-center">
              <Users className="w-8 h-8 opacity-30" />
              No friends yet — add someone above to start chatting!
            </div>
          ) : (
            friends.map(f => (
              <button
                key={f.id}
                onClick={() => openChat(f)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
                  selected?.id === f.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="text-xs font-semibold">
                    {f.email.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate">{f.email}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat panel ── */}
      <div className={cn(
        'flex flex-col flex-1 overflow-hidden',
        mobileView === 'list' ? 'hidden sm:flex' : 'flex'
      )}>
        {selected ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-8 w-8"
                onClick={() => setMobileView('list')}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs font-semibold">
                  {selected.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold leading-tight">{selected.email}</p>
                <p className="text-xs text-muted-foreground">Friend</p>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                  <MessageCircleIcon />
                  <span>No messages yet — say hi! 👋</span>
                </div>
              ) : (
                messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    myId={myId}
                    friendEmail={selected.email}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Message input */}
            <div className="px-3 py-3 border-t bg-card shrink-0">
              <div className="relative" ref={emojiRef}>
                {/* Emoji picker */}
                {showEmoji && (
                  <div className="absolute bottom-full mb-2 left-0 z-50 bg-card border rounded-xl shadow-lg p-3">
                    <div className="grid grid-cols-8 gap-1">
                      {ALL_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="text-xl leading-none p-1.5 rounded hover:bg-muted transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowEmoji(v => !v)}
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                  <Input
                    ref={inputRef}
                    placeholder="Type a message…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    size="icon"
                    className="h-9 w-9 shrink-0"
                  >
                    {sending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageCircleIcon size={40} />
            <p className="text-sm">Select a friend to start chatting</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageCircleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function MessageBubble({ msg, myId, friendEmail }: { msg: Message; myId: string; friendEmail: string }) {
  const isMine = msg.sender_id === myId
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Split card
  if (msg.type === 'split' && msg.split) {
    const s = msg.split
    return (
      <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
        <div className="max-w-[80%] rounded-xl border bg-card shadow-sm p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SplitSquareVertical className="w-3 h-3" />
            <span>{isMine ? 'You' : friendEmail.split('@')[0]} created a split</span>
          </div>
          <p className="font-semibold text-sm leading-snug">{s.title}</p>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">{s.category}</Badge>
            <span className="font-bold text-primary text-sm">{formatCurrency(s.total_amount)}</span>
          </div>
          {s.split_participants && s.split_participants.length > 0 && (
            <div className="space-y-1 pt-1 border-t">
              {s.split_participants.map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{p.participant_name}</span>
                  <span className={p.is_paid ? 'text-emerald-600' : ''}>{formatCurrency(p.amount_owed)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{time}</p>
        </div>
      </div>
    )
  }

  // Text bubble
  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words',
        isMine
          ? 'bg-primary text-primary-foreground rounded-br-sm'
          : 'bg-muted rounded-bl-sm'
      )}>
        <p>{msg.content}</p>
        <p className={cn('text-[10px] mt-0.5', isMine ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground')}>
          {time}
        </p>
      </div>
    </div>
  )
}
