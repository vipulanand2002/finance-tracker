'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, Plus, Trash2, Send, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { usePush } from '@/lib/use-push'
import {
  DEFAULT_NOTIFY_TIMES, MAX_NOTIFY_TIMES, defaultNotifySettings, formatTime12, isValidTime,
  parseNotifySettings, type NotifySettings,
} from '@/lib/notify-settings'

const deviceTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' } catch { return 'Asia/Kolkata' }
}

export default function NotificationSettingsCard() {
  const push = usePush()
  const [settings, setSettings] = useState<NotifySettings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      setSettings(parseNotifySettings(user?.user_metadata?.notify) ?? { ...defaultNotifySettings(deviceTz()), enabled: false })
      setLoaded(true)
    })
  }, [])

  async function save(next: NotifySettings) {
    const prev = settings
    setSettings(next)
    const { error } = await createClient().auth.updateUser({ data: { notify: next } })
    if (error) { setSettings(prev); toast.error('Could not save your notification settings') }
    return !error
  }

  async function toggleEnabled(on: boolean) {
    if (!settings) return
    if (on) {
      if (!(await push.enable())) return
      if (await save({ ...settings, enabled: true, tz: deviceTz(), times: settings.times.length ? settings.times : DEFAULT_NOTIFY_TIMES })) {
        toast.success('Notifications turned on')
      }
    } else {
      await push.disable()
      if (await save({ ...settings, enabled: false })) toast.success('Notifications turned off')
    }
  }

  function setTime(i: number, value: string) {
    if (!settings || !isValidTime(value)) return
    const times = settings.times.map((t, idx) => (idx === i ? value : t))
    save({ ...settings, times: Array.from(new Set(times)).sort() })
  }

  function addTime() {
    if (!settings || settings.times.length >= MAX_NOTIFY_TIMES) return
    // Pick the first free hour that isn't already scheduled
    const free = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`).find(t => !settings.times.includes(t)) ?? '12:00'
    save({ ...settings, times: [...settings.times, free].sort() })
  }

  function removeTime(i: number) {
    if (!settings) return
    save({ ...settings, times: settings.times.filter((_, idx) => idx !== i) })
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      toast.success('Test notification sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send test')
    } finally {
      setTesting(false)
    }
  }

  if (!loaded || !settings) return <Skeleton className="h-72" />

  const on = settings.enabled && push.subscribed

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {on ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
          Reminder notifications
        </CardTitle>
        <CardDescription>
          A nudge to add your transactions at the times you choose, sent to every device where you’ve allowed notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Enable notifications</p>
            <p className="text-xs text-muted-foreground">
              {!push.supported
                ? 'This browser can’t receive push notifications. On iPhone, add the app to your Home Screen first.'
                : push.denied
                  ? 'Blocked for this site — allow notifications in your browser or phone settings, then try again.'
                  : on ? 'On for this device' : 'Off — you won’t get any reminders'}
            </p>
          </div>
          <Switch
            checked={on}
            disabled={!push.supported || push.loading || (push.denied && !on)}
            onCheckedChange={toggleEnabled}
            aria-label="Enable notifications"
          />
        </div>

        <div className={on ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'} aria-disabled={!on}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">When to remind you</p>
              <p className="text-xs text-muted-foreground">
                {settings.times.length === 0
                  ? 'No reminders scheduled'
                  : `${settings.times.length} reminder${settings.times.length !== 1 ? 's' : ''} a day · ${settings.tz.replace('_', ' ')}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => save({ ...settings, times: DEFAULT_NOTIFY_TIMES })}>
              Reset to 10 AM · 2 PM · 10 PM
            </Button>
          </div>

          <ul className="space-y-2">
            {settings.times.map((t, i) => (
              <li key={t} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Input
                  type="time"
                  defaultValue={t}
                  onBlur={e => { if (e.target.value && e.target.value !== t) setTime(i, e.target.value) }}
                  className="w-36"
                  aria-label={`Reminder ${i + 1} time`}
                />
                <span className="text-sm text-muted-foreground flex-1">{formatTime12(t)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTime(i)} aria-label="Remove this reminder">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={addTime} disabled={settings.times.length >= MAX_NOTIFY_TIMES}>
              <Plus className="w-4 h-4 mr-1.5" /> Add a time
            </Button>
            <Button variant="outline" size="sm" onClick={sendTest} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send a test
            </Button>
            {settings.times.length >= MAX_NOTIFY_TIMES && (
              <span className="text-xs text-muted-foreground">Up to {MAX_NOTIFY_TIMES} a day</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
