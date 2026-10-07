'use client'

import { useMemo, useSyncExternalStore } from 'react'

// The user's custom nav order lives in their Supabase user_metadata.nav_order
// (so it follows them across devices). This localStorage copy is only a cache
// so the sidebar renders the right order immediately, with no flash of the
// default order on page load. All consumers stay in sync via a window event.
const KEY = 'nav_order_v1'
const EVENT = 'navOrderChanged'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener('storage', cb)
    window.removeEventListener(EVENT, cb)
  }
}
const getSnapshot = () => {
  try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
}
const getServerSnapshot = () => ''

/** Saved nav order (array of hrefs) or null when the user uses the default. */
export function useNavOrder(): string[] | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as string[]) : null
    } catch { return null }
  }, [raw])
}

/** Update the local cache and notify every mounted sidebar/settings view. */
export function setCachedNavOrder(order: string[] | null) {
  try {
    if (order) localStorage.setItem(KEY, JSON.stringify(order))
    else localStorage.removeItem(KEY)
  } catch { /* storage unavailable — UI still updates via the event below */ }
  window.dispatchEvent(new Event(EVENT))
}

/** Reconcile the cache with what's stored on the account (called on load). */
export function syncNavOrderFromAccount(order: unknown) {
  const next = Array.isArray(order) && order.every(o => typeof o === 'string') ? (order as string[]) : null
  const current = getSnapshot()
  const nextRaw = next ? JSON.stringify(next) : ''
  if (current !== nextRaw) setCachedNavOrder(next)
}
