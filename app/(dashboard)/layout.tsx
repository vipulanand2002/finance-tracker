import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/layout/DashboardShell'
import { isApproved } from '@/lib/access'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  // New accounts wait here until the admin approves them
  if (!isApproved(user)) redirect('/pending')

  return <DashboardShell email={user.email ?? ''}>{children}</DashboardShell>
}
