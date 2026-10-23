import type { User } from '@supabase/supabase-js'

// Access control: the admin approves every new account before it can use the app.
// Approval lives in the account's app_metadata, which only the server (service role)
// can change — a user can't approve themselves.
export const ADMIN_EMAIL = 'karnvipul2002@gmail.com'

export type Approval = 'approved' | 'pending' | 'rejected'

type UserLike = Pick<User, 'email' | 'email_confirmed_at' | 'app_metadata'>

/** The admin is identified by a verified email address. */
export function isAdmin(user: UserLike | null | undefined): boolean {
  return !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL && !!user.email_confirmed_at
}

export function approvalOf(user: UserLike | null | undefined): Approval {
  if (!user) return 'pending'
  if (isAdmin(user)) return 'approved'
  const v = (user.app_metadata as { approval?: string } | undefined)?.approval
  return v === 'approved' || v === 'rejected' ? v : 'pending'
}

export const isApproved = (user: UserLike | null | undefined) => approvalOf(user) === 'approved'

/** Client-side hint only (to show/hide menu items); the server always re-checks. */
export const isAdminEmail = (email: string | null | undefined) => !!email && email.toLowerCase() === ADMIN_EMAIL
