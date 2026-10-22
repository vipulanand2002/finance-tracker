// Helpers for the on-device reminder times (the Android app stores and fires them).

export const MAX_NOTIFY_TIMES = 6
export const DEFAULT_NOTIFY_TIMES = ['10:00', '14:00', '22:00']

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

export function formatTime12(t: string) {
  const h = Number(t.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`
}

/** What the Android app exposes to the page as window.AndroidApp */
export interface AndroidAppBridge {
  getState(): string
  save(enabled: boolean, timesCsv: string): void
  requestPermission(): void
  sendTest(): void
  openExactAlarmSettings(): void
}

export interface AndroidReminderState {
  enabled: boolean
  times: string[]
  /** Notification permission granted */
  permission: boolean
  /** Alarms can fire at the exact minute (otherwise they may be a few minutes late) */
  exact: boolean
}

declare global {
  interface Window { AndroidApp?: AndroidAppBridge }
}
