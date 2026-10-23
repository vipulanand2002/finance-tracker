'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, BellOff, Plus, Trash2, Send, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DEFAULT_NOTIFY_TIMES, MAX_NOTIFY_TIMES, formatTime12, isValidTime,
  type AndroidReminderState,
} from '@/lib/notify-settings'

// Reminders run on the phone itself (the Android app schedules them with the
// device clock), so this page only controls them when opened inside that app.
export default function NotificationSettingsCard() {
  const [checked, setChecked] = useState(false)
  const [inApp, setInApp] = useState(false)
  const [state, setState] = useState<AndroidReminderState | null>(null)

  const read = useCallback(() => {
    try {
      const raw = window.AndroidApp?.getState()
      if (raw) setState(JSON.parse(raw) as AndroidReminderState)
    } catch { /* bridge unavailable */ }
  }, [])

  useEffect(() => {
    const present = !!window.AndroidApp
    // The app tells the page when permission / alarm access changes
    window.addEventListener('androidstate', read)
    Promise.resolve().then(() => { setInApp(present); setChecked(true); if (present) read() })
    return () => window.removeEventListener('androidstate', read)
  }, [read])

  function persist(enabled: boolean, times: string[]) {
    window.AndroidApp?.save(enabled, times.join(','))
    read()
  }

  function toggleEnabled(on: boolean) {
    if (!state) return
    if (on && !state.permission) {
      // Android asks the user; the app notifies us when they answer
      window.AndroidApp?.requestPermission()
      persist(true, state.times.length ? state.times : DEFAULT_NOTIFY_TIMES)
      return
    }
    persist(on, state.times.length ? state.times : DEFAULT_NOTIFY_TIMES)
    toast.success(on ? 'Reminders turned on' : 'Reminders turned off')
  }

  function setTime(i: number, value: string) {
    if (!state || !isValidTime(value)) return
    const times = Array.from(new Set(state.times.map((t, idx) => (idx === i ? value : t)))).sort()
    persist(state.enabled, times)
  }

  function addTime() {
    if (!state || state.times.length >= MAX_NOTIFY_TIMES) return
    const free = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`).find(t => !state.times.includes(t)) ?? '12:00'
    persist(state.enabled, [...state.times, free].sort())
  }

  if (!checked) return <Skeleton className="h-72" />

  if (!inApp || !state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BellOff className="w-5 h-5 text-muted-foreground" /> Reminder notifications</CardTitle>
          <CardDescription>Reminders to add your transactions are available in the Android app only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>They’re set on your phone and follow its clock, so they work even without a connection.</p>
          <p className="text-xs">Already installed? Open the app from your home screen (not Chrome) and come back here. If this message still shows inside the app, install the latest build over it.</p>
          <Link href="/settings/home-screen">
            <Button variant="outline" size="sm"><Smartphone className="w-4 h-4 mr-2" /> Get the Android app</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const on = state.enabled && state.permission

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {on ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
          Reminder notifications
        </CardTitle>
        <CardDescription>
          A nudge to add your transactions at the times you choose, using this phone’s clock.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Enable notifications</p>
            <p className="text-xs text-muted-foreground">
              {state.enabled && !state.permission
                ? 'Notifications are blocked for this app — allow them in your phone’s app settings.'
                : on ? 'On for this phone' : 'Off — you won’t get any reminders'}
            </p>
          </div>
          <Switch checked={on} onCheckedChange={toggleEnabled} aria-label="Enable notifications" />
        </div>

        <div className={on ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'} aria-disabled={!on}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">When to remind you</p>
              <p className="text-xs text-muted-foreground">
                {state.times.length === 0
                  ? 'No reminders scheduled'
                  : `${state.times.length} reminder${state.times.length !== 1 ? 's' : ''} a day`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => persist(state.enabled, DEFAULT_NOTIFY_TIMES)}>
              Reset to 10 AM · 2 PM · 10 PM
            </Button>
          </div>

          <ul className="space-y-2">
            {state.times.map((t, i) => (
              <li key={t} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Input
                  type="time"
                  defaultValue={t}
                  onBlur={e => { if (e.target.value && e.target.value !== t) setTime(i, e.target.value) }}
                  className="w-36"
                  aria-label={`Reminder ${i + 1} time`}
                />
                <span className="text-sm text-muted-foreground flex-1">{formatTime12(t)}</span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove this reminder"
                  onClick={() => persist(state.enabled, state.times.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={addTime} disabled={state.times.length >= MAX_NOTIFY_TIMES}>
              <Plus className="w-4 h-4 mr-1.5" /> Add a time
            </Button>
            <Button variant="outline" size="sm" onClick={() => { window.AndroidApp?.sendTest(); toast.success('Test notification sent') }}>
              <Send className="w-4 h-4 mr-1.5" /> Send a test
            </Button>
            {state.times.length >= MAX_NOTIFY_TIMES && (
              <span className="text-xs text-muted-foreground">Up to {MAX_NOTIFY_TIMES} a day</span>
            )}
          </div>

          {!state.exact && (
            <p className="text-xs text-muted-foreground">
              Reminders may arrive a few minutes late.{' '}
              <button type="button" className="underline" onClick={() => window.AndroidApp?.openExactAlarmSettings()}>
                Allow exact timing
              </button>
            </p>
          )}
        </div>
        {state.version ? <p className="text-xs text-muted-foreground">Finance App v{state.version}</p> : null}
      </CardContent>
    </Card>
  )
}
