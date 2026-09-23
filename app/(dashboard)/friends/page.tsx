'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Send, Smile, Loader2, UserPlus, ArrowLeft, Pencil, Trash2, Search,
  SplitSquareVertical, MessageCircle, BellRing, Mail, BadgeCheck, Check, X, Clock, Receipt,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
const SplitModal = dynamic(() => import('@/components/splits/SplitModal'), { ssr: false })
import type { Message } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Friend {
  id: string               // contacts.id
  name: string
  email: string | null
  notes: string | null
  created_at: string
  connected: boolean       // true if friendship established
  friend_user_id: string | null
  friendship_id: string | null
  display_name?: string
  avatar_url?: string | null
  request_status?: 'pending' | 'accepted' | 'rejected' | null
}

interface IncomingRequest {
  id: string
  from_user_id: string
  from_name: string
  from_email: string
  created_at: string
}

interface SplitRow {
  id: string
  title: string
  total_amount: number
  date: string
  category: string
  split_participants?: { id: string; participant_name: string; participant_email: string | null; amount_owed: number; is_paid: boolean }[]
}

interface TaggedTxn {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  date: string
  split_id: string | null
}

interface FriendForm { name: string; email: string; notes: string }
const emptyForm = (): FriendForm => ({ name: '', email: '', notes: '' })

// ─── Emoji ────────────────────────────────────────────────────────────────────

const ALL_EMOJIS = [
  '😀','😂','😍','🥰','😊','😎','😅','🤣',
  '👍','👏','🙏','🤝','💪','👌','✌️','🤗',
  '❤️','💕','💯','🔥','✨','🎉','🙌','👋',
  '😢','😭','😤','😠','🤔','🤩','😴','🥹',
  '💸','💰','🍕','🍺','🎂','🚗','✈️','🏠',
]

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function avatarColor(name: string) {
  const colors = ['bg-red-500','bg-orange-500','bg-amber-500','bg-emerald-500','bg-teal-500','bg-blue-500','bg-indigo-500','bg-violet-500','bg-pink-500']
  return colors[name.charCodeAt(0) % colors.length]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const [myId, setMyId] = useState('')
  const [friends, setFriends] = useState<Friend[]>([])
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([])
  const [processingReq, setProcessingReq] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Friend | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  // Add / Edit form
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Friend | null>(null)
  const [form, setForm] = useState<FriendForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // Chat (connected friends only)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [chatTab, setChatTab] = useState<'chat' | 'splits'>('chat')

  // Splits (all friends)
  const [splits, setSplits] = useState<SplitRow[]>([])
  const [loadingSplits, setLoadingSplits] = useState(false)

  // Tagged transactions (expenses tagged to this friend, no split linked)
  const [taggedTxns, setTaggedTxns] = useState<TaggedTxn[]>([])

  // Split modal
  const [splitOpen, setSplitOpen] = useState(false)

  // Reminder
  const [sendingReminder, setSendingReminder] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => { if (user) setMyId(user.id) })
    loadFriends()
    loadIncomingRequests()
  }, [])

  const loadFriends = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/friends')
      const data = await res.json()
      setFriends(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadIncomingRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/friend-requests')
      const data = await res.json()
      setIncomingRequests(Array.isArray(data) ? data : [])
    } catch { /* non-critical */ }
  }, [])

  async function handleRequestAction(requestId: string, action: 'accept' | 'reject') {
    setProcessingReq(requestId)
    try {
      const res = await fetch('/api/friend-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, action }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'accept' ? 'Friend request accepted!' : 'Friend request declined')
      await Promise.all([loadFriends(true), loadIncomingRequests()])
    } catch {
      toast.error('Action failed, please try again')
    } finally {
      setProcessingReq(null)
    }
  }

  // Keep selected friend in sync after reload
  useEffect(() => {
    if (selected) {
      const updated = friends.find(f => f.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [friends])

  // ── Load detail when friend selected ──────────────────────────────────────

  useEffect(() => {
    if (!selected) { setMessages([]); setSplits([]); setTaggedTxns([]); return }
    if (selected.connected && selected.friend_user_id) loadMessages(selected.friend_user_id)
    loadSplits(selected)
    loadTaggedTxns(selected)
  }, [selected?.id])

  function loadMessages(friendUserId: string) {
    setLoadingMsgs(true)
    fetch(`/api/messages?friend_id=${friendUserId}`)
      .then(r => r.json())
      .then(d => setMessages(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoadingMsgs(false))
  }

  function loadSplits(friend: Friend) {
    setLoadingSplits(true)
    const url = `/api/splits?contact_id=${friend.id}${friend.email ? `&contact_email=${encodeURIComponent(friend.email.toLowerCase())}` : ''}`
    fetch(url)
      .then(r => r.json())
      .then(d => setSplits(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingSplits(false))
  }

  function loadTaggedTxns(friend: Friend) {
    fetch(`/api/transactions?contact_id=${friend.id}`)
      .then(r => r.json())
      .then((d: TaggedTxn[]) => {
        // Show all tagged transactions; owed calc only uses unsplit expenses
        setTaggedTxns(Array.isArray(d) ? d.filter(t => !t.split_id) : [])
      })
      .catch(() => {})
  }

  // ── Realtime messages ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!myId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`friend-messages-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as Message
        setMessages(prev => {
          const selFriend = selected
          const inConv = selFriend?.friend_user_id &&
            ((msg.sender_id === myId && msg.receiver_id === selFriend.friend_user_id) ||
             (msg.sender_id === selFriend.friend_user_id && msg.receiver_id === myId))
          if (!inConv) return prev
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myId, selected])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Close emoji on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(f: Friend) {
    setEditing(f)
    setForm({ name: f.name, email: f.email ?? '', notes: f.notes ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/friends?id=${editing.id}` : '/api/friends'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      toast.success(editing ? 'Updated!' : 'Friend added!')
      setModalOpen(false)
      await loadFriends(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(f: Friend) {
    if (!confirm(`Remove "${f.name}" from your friends?`)) return
    try {
      await fetch(`/api/friends?id=${f.id}`, { method: 'DELETE' })
      toast.success('Removed')
      if (selected?.id === f.id) { setSelected(null); setMobileView('list') }
      loadFriends(true)
    } catch {
      toast.error('Failed to remove')
    }
  }

  async function sendMessage() {
    if (!chatInput.trim() || !selected?.friend_user_id || sending) return
    const content = chatInput.trim()
    setChatInput('')
    setShowEmoji(false)
    setSending(true)
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, sender_id: myId, receiver_id: selected.friend_user_id!,
      content, type: 'text', split_id: null, created_at: new Date().toISOString(),
    }])
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: selected.friend_user_id, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessages(prev => prev.map(m => m.id === tempId ? data : m))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      toast.error('Message failed')
    } finally {
      setSending(false)
    }
  }

  async function sendReminder(f: Friend) {
    if (!f.email) { toast.warning('No email — add one to send reminders'); return }
    setSendingReminder(true)
    try {
      const res = await fetch('/api/mail/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', contact_id: f.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'no_pending_splits') toast.info('No pending splits for this friend.')
        else toast.error(data.error ?? 'Failed')
        return
      }
      toast.success(`Reminder sent!`)
    } catch {
      toast.error('Failed to send reminder')
    } finally {
      setSendingReminder(false)
    }
  }

  function selectFriend(f: Friend) {
    setSelected(f)
    setMobileView('detail')
    setChatTab('chat')
    setChatInput('')
    setShowEmoji(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = friends.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const selectedEmailLower = selected?.email?.toLowerCase()
  const splitOwed = splits.reduce((sum, s) => {
    const relevant = (s.split_participants ?? []).filter(p =>
      !p.is_paid && (selectedEmailLower ? p.participant_email?.toLowerCase() === selectedEmailLower : false)
    )
    return sum + relevant.reduce((a, p) => a + p.amount_owed, 0)
  }, 0)
  const txnOwed = taggedTxns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  const txnReceived = taggedTxns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  // positive = friend owes you; negative = you owe friend
  const netBalance = splitOwed + txnOwed - txnReceived

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="-m-4 md:-m-6 flex" style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* ══ Left: friend list ══ */}
      <div className={cn(
        'flex flex-col border-r bg-card w-full sm:w-72 shrink-0',
        mobileView === 'detail' ? 'hidden sm:flex' : 'flex'
      )}>
        {/* Header */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">Friends</p>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openAdd}>
              <UserPlus className="w-3.5 h-3.5" />Add
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Incoming friend requests section ── */}
          {incomingRequests.length > 0 && (
            <div className="border-b">
              <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                Requests ({incomingRequests.length})
              </p>
              {incomingRequests.map(req => (
                <div key={req.id} className="px-3 py-2.5 flex items-center gap-2.5">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {initials(req.from_name || req.from_email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate leading-tight">{req.from_name || req.from_email}</p>
                    {req.from_email && (
                      <p className="text-xs text-muted-foreground truncate leading-tight">{req.from_email}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={!!processingReq}
                      onClick={() => handleRequestAction(req.id, 'reject')}
                      title="Decline"
                    >
                      {processingReq === req.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <X className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon"
                      className="h-7 w-7"
                      disabled={!!processingReq}
                      onClick={() => handleRequestAction(req.id, 'accept')}
                      title="Accept"
                    >
                      {processingReq === req.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Regular contacts list ── */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground text-xs text-center px-4">
              <UserPlus className="w-7 h-7 opacity-30" />
              {search ? 'No results' : 'No friends yet — add someone!'}
            </div>
          ) : (
            filtered.map(f => (
              <button
                key={f.id}
                onClick={() => selectFriend(f)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  selected?.id === f.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                )}
              >
                <Avatar className="w-8 h-8 shrink-0">
                  {f.avatar_url && <AvatarImage src={f.avatar_url} alt={f.name} className="object-cover" />}
                  <AvatarFallback className={`text-white text-xs font-semibold ${avatarColor(f.name)}`}>
                    {initials(f.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium truncate leading-tight">{f.name}</p>
                    {f.connected && <BadgeCheck className="w-3.5 h-3.5 shrink-0 text-blue-500" />}
                    {f.request_status === 'pending' && (
                      <Clock className="w-3 h-3 shrink-0 text-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate leading-tight">
                    {f.request_status === 'pending'
                      ? <span className="text-amber-600 dark:text-amber-400">Request sent</span>
                      : f.request_status === 'rejected'
                        ? <span className="text-destructive/70">Request declined</span>
                        : (f.email ?? 'No email')}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ══ Right: detail panel ══ */}
      <div className={cn('flex flex-col flex-1 overflow-hidden', mobileView === 'list' ? 'hidden sm:flex' : 'flex')}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a friend to view details</p>
            <Button variant="outline" size="sm" onClick={openAdd} className="mt-1">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />Add a friend
            </Button>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
              <Button variant="ghost" size="icon" className="sm:hidden h-8 w-8" onClick={() => setMobileView('list')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Avatar className="w-9 h-9 shrink-0">
                {selected.avatar_url && <AvatarImage src={selected.avatar_url} alt={selected.name} className="object-cover" />}
                <AvatarFallback className={`text-white text-sm font-semibold ${avatarColor(selected.name)}`}>
                  {initials(selected.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm leading-tight truncate">{selected.name}</p>
                  {selected.connected && <BadgeCheck className="w-4 h-4 shrink-0 text-blue-500" />}
                </div>
                {selected.email && <p className="text-xs text-muted-foreground truncate">{selected.email}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Create split" onClick={() => setSplitOpen(true)}>
                  <SplitSquareVertical className="w-4 h-4" />
                </Button>
                {selected.email && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Send reminder"
                    onClick={() => sendReminder(selected)} disabled={sendingReminder}>
                    {sendingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => openEdit(selected)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive/60 hover:text-destructive" title="Remove"
                  onClick={() => handleDelete(selected)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Tab bar — only show for connected friends */}
            {selected.connected && (
              <div className="flex border-b bg-card shrink-0 px-1">
                {(['chat', 'splits'] as const).map(t => (
                  <button key={t} onClick={() => setChatTab(t)}
                    className={cn(
                      'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize',
                      chatTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}>
                    {t === 'chat' ? <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />Chat</span>
                      : <span className="flex items-center gap-1.5"><SplitSquareVertical className="w-3.5 h-3.5" />Splits{splits.length > 0 && ` (${splits.length})`}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* ── Chat panel (connected only, chat tab) ── */}
            {selected.connected && chatTab === 'chat' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                      <MessageCircle className="w-8 h-8 opacity-20" />
                      <span>No messages yet — say hi! 👋</span>
                    </div>
                  ) : (
                    messages.map(msg => (
                      <MessageBubble key={msg.id} msg={msg} myId={myId} friendName={selected.name} />
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="px-3 py-3 border-t bg-card shrink-0">
                  <div className="relative" ref={emojiRef}>
                    {showEmoji && (
                      <div className="absolute bottom-full mb-2 left-0 z-50 bg-card border rounded-xl shadow-lg p-3">
                        <div className="grid grid-cols-8 gap-1">
                          {ALL_EMOJIS.map(e => (
                            <button key={e} type="button" onClick={() => { setChatInput(v => v + e); inputRef.current?.focus() }}
                              className="text-xl p-1.5 rounded hover:bg-muted transition-colors">{e}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                        onClick={() => setShowEmoji(v => !v)}>
                        <Smile className="w-5 h-5" />
                      </Button>
                      <Input ref={inputRef} placeholder="Type a message…" value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        className="flex-1" />
                      <Button onClick={sendMessage} disabled={!chatInput.trim() || sending} size="icon" className="h-9 w-9 shrink-0">
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Splits panel (all friends, or "splits" tab for connected) ── */}
            {(!selected.connected || chatTab === 'splits') && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Balance summary */}
                {!loadingSplits && (splits.length > 0 || taggedTxns.length > 0) && (
                  <div className={cn(
                    'rounded-xl p-4',
                    netBalance > 0 ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                    : netBalance < 0 ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {netBalance > 0 ? `${selected.name} owes you`
                            : netBalance < 0 ? `You owe ${selected.name}`
                            : 'All settled up'}
                        </p>
                        {netBalance !== 0 && (
                          <p className={cn('text-xl font-bold', netBalance > 0 ? 'text-amber-600' : 'text-blue-600')}>
                            {formatCurrency(Math.abs(netBalance))}
                          </p>
                        )}
                      </div>
                      {selected.email && netBalance > 0 && (
                        <Button size="sm" variant="outline" onClick={() => sendReminder(selected)} disabled={sendingReminder}>
                          {sendingReminder ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
                          Remind
                        </Button>
                      )}
                    </div>
                    {(splitOwed > 0 || txnOwed > 0 || txnReceived > 0) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {splitOwed > 0 && <span>Splits: <span className="font-medium text-amber-600">{formatCurrency(splitOwed)}</span></span>}
                        {txnOwed > 0 && <span>Expenses: <span className="font-medium text-amber-600">{formatCurrency(txnOwed)}</span></span>}
                        {txnReceived > 0 && <span>Received: <span className="font-medium text-emerald-600">−{formatCurrency(txnReceived)}</span></span>}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Splits with {selected.name}</p>
                  <Button size="sm" variant="outline" onClick={() => setSplitOpen(true)}>
                    <SplitSquareVertical className="w-3.5 h-3.5 mr-1.5" />New Split
                  </Button>
                </div>

                {loadingSplits ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : splits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                    <SplitSquareVertical className="w-8 h-8 opacity-20" />
                    No splits with {selected.name} yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {splits.map(s => {
                      const relevant = selectedEmailLower
                        ? (s.split_participants ?? []).filter(p => p.participant_email?.toLowerCase() === selectedEmailLower)
                        : []
                      const unpaid = relevant.filter(p => !p.is_paid)
                      const owed = unpaid.reduce((a, p) => a + p.amount_owed, 0)
                      const settled = relevant.length > 0 && relevant.every(p => p.is_paid)
                      return (
                        <div key={s.id} className="p-4 rounded-xl border bg-card space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm">{s.title}</p>
                            <span className={cn('text-sm font-semibold shrink-0', settled ? 'text-emerald-600' : owed > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                              {settled ? 'Settled' : owed > 0 ? formatCurrency(owed) : formatCurrency(s.total_amount)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(s.date + 'T00:00:00'), 'dd MMM yyyy')} · {s.category} · Total {formatCurrency(s.total_amount)}
                          </p>
                          {relevant.length === 0 && !selectedEmailLower && (
                            <p className="text-xs text-muted-foreground italic">Add email to see individual share</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Tagged transactions */}
                {taggedTxns.length > 0 && (
                  <>
                    <p className="text-sm font-semibold pt-1">Tagged Transactions</p>
                    <div className="space-y-3">
                      {taggedTxns.map(t => (
                        <div key={t.id} className="p-4 rounded-xl border bg-card space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Receipt className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <p className="font-medium text-sm truncate">{t.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn('text-sm font-semibold', t.type === 'income' ? 'text-emerald-600' : 'text-amber-600')}>
                                {t.type === 'income' ? '+' : ''}{formatCurrency(t.amount)}
                              </span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', t.type === 'income' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40')}>
                                {t.type === 'income' ? 'Received' : 'Owed'}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(t.date + 'T00:00:00'), 'dd MMM yyyy')} · {t.category}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ Add / Edit modal ══ */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Friend' : 'Add Friend'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <p className="text-xs text-muted-foreground">If they have an account, chat will be enabled automatically</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g. roommate, colleague…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Save' : 'Add Friend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Split modal ══ */}
      {selected && (
        <SplitModal
          open={splitOpen}
          onClose={() => setSplitOpen(false)}
          onSaved={() => { setSplitOpen(false); loadSplits(selected) }}
          defaultParticipants={[{ name: selected.name, email: selected.email ?? '' }]}
        />
      )}
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, myId, friendName }: { msg: Message; myId: string; friendName: string }) {
  const isMine = msg.sender_id === myId
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (msg.type === 'split' && msg.split) {
    const s = msg.split
    return (
      <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
        <div className="max-w-[80%] rounded-xl border bg-card shadow-sm p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SplitSquareVertical className="w-3 h-3" />
            <span>{isMine ? 'You' : friendName} shared a split</span>
          </div>
          <p className="font-semibold text-sm">{s.title}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">{s.category}</span>
            <span className="font-bold text-primary text-sm">{formatCurrency(s.total_amount)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words',
        isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
      )}>
        <p>{msg.content}</p>
        <p className={cn('text-[10px] mt-0.5', isMine ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground')}>
          {time}
        </p>
      </div>
    </div>
  )
}
