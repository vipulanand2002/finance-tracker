'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(r => setTimeout(() => r(null), 5000)),
  ])
  return reg as ServiceWorkerRegistration | null
}

/** Whether this device can get push notifications, and whether it's switched on. */
export function usePush() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    let cancelled = false
    getRegistration().then(async reg => {
      if (cancelled) return
      setSupported(true)
      setDenied(Notification.permission === 'denied')
      const sub = await reg?.pushManager.getSubscription()
      if (!cancelled) setSubscribed(!!sub)
    })
    return () => { cancelled = true }
  }, [])

  const enable = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await getRegistration()
      if (!reg) { toast.error('Service worker not ready. Try refreshing the page.'); return false }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setDenied(permission === 'denied')
        toast.error('Notifications are blocked. Allow them in your browser or phone settings.')
        return false
      }
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
      })
      if (!res.ok) throw new Error('Failed to save subscription')
      setSubscribed(true)
      return true
    } catch (err) {
      console.error(err)
      toast.error('Could not turn on notifications')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
      }
      setSubscribed(false)
      return true
    } catch (err) {
      console.error(err)
      toast.error('Could not turn off notifications')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, subscribed, denied, loading, enable, disable }
}
