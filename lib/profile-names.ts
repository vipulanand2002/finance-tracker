import { createClient } from '@/lib/supabase/client'

// Look up each person's own chosen display name (profiles.full_name) by email.
// Used as a fallback so a viewer sees a person's real name rather than the
// nickname whoever created a split happened to type. profiles are world-readable.
export async function fetchProfileNames(emails: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(emails.map(e => e?.toLowerCase()).filter((e): e is string => !!e))]
  if (uniq.length === 0) return new Map()
  try {
    const { data } = await createClient().from('profiles').select('email, full_name').in('email', uniq)
    return new Map(
      (data ?? [])
        .filter((p: { full_name: string | null }) => !!p.full_name)
        .map((p: { email: string; full_name: string }) => [p.email.toLowerCase(), p.full_name])
    )
  } catch {
    return new Map()
  }
}
