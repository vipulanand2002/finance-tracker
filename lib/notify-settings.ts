// Scheduled reminder notifications. Stored on the account (Supabase user_metadata.notify)
// so the settings follow the user and the scheduler can read them without a migration.

export interface NotifySettings {
  enabled: boolean
  /** 'HH:MM' (24h) in the user's timezone, sorted, unique */
  times: string[]
  /** IANA timezone, e.g. 'Asia/Kolkata' */
  tz: string
}

export const MAX_NOTIFY_TIMES = 6
export const DEFAULT_NOTIFY_TIMES = ['10:00', '14:00', '22:00']

export const defaultNotifySettings = (tz = 'Asia/Kolkata'): NotifySettings => ({
  enabled: true,
  times: DEFAULT_NOTIFY_TIMES,
  tz,
})

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const isValidTime = (t: string) => TIME_RE.test(t)

/** Coerce whatever is stored into a valid settings object (null = never configured). */
export function parseNotifySettings(raw: unknown): NotifySettings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const times = Array.isArray(r.times)
    ? Array.from(new Set(r.times.filter((t): t is string => typeof t === 'string' && TIME_RE.test(t)))).sort().slice(0, MAX_NOTIFY_TIMES)
    : DEFAULT_NOTIFY_TIMES
  return {
    enabled: r.enabled !== false,
    times,
    tz: typeof r.tz === 'string' && r.tz ? r.tz : 'Asia/Kolkata',
  }
}

export const timeToMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export function formatTime12(t: string) {
  const h = Number(t.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`
}
