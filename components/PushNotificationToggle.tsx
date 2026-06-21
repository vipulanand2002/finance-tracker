'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  // Use existing registration or wait up to 5 s for one
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ])
  return reg as ServiceWorkerRegistration | null
}

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setSupported(true)
    getRegistration().then((reg) => {
      if (!reg) return
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
    })
  }, [])

  if (!supported) return null

  async function toggle() {
    setLoading(true)
    try {
      const reg = await getRegistration()
      if (!reg) {
        toast.error('Service worker not ready. Try refreshing the page.')
        return
      }

      if (subscribed) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
        setSubscribed(false)
        toast.success('Push notifications disabled')
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          toast.error('Notification permission denied. Enable it in your browser settings.')
          return
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        })
        const json = sub.toJSON()
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
        })
        if (!res.ok) throw new Error('Failed to save subscription')
        setSubscribed(true)
        toast.success('Push notifications enabled!')
      }
    } catch (err) {
      console.error(err)
      toast.error('Could not update notification settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="gap-2 text-muted-foreground hover:text-foreground"
      title={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
    >
      {subscribed
        ? <Bell className="w-4 h-4 text-primary" />
        : <BellOff className="w-4 h-4" />}
      <span className="hidden sm:inline text-xs">
        {subscribed ? 'Notifs on' : 'Enable notifs'}
      </span>
    </Button>
  )
}
