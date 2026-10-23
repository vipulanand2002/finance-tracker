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
  /** Update notices kept by the app (JSON array) — absent on older builds */
  getUpdates?(): string
  clearUpdates?(): void
}

export interface AndroidReminderState {
  enabled: boolean
  times: string[]
  /** Notification permission granted */
  permission: boolean
  /** Alarms can fire at the exact minute (otherwise they may be a few minutes late) */
  exact: boolean
  /** Installed app build number */
  build?: number
  /** Installed app version name, e.g. 1.0.5 */
  version?: string
}

declare global {
  interface Window { AndroidApp?: AndroidAppBridge }
}
