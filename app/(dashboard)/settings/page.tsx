'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SETTINGS_SECTIONS } from '@/lib/settings-sections'
import { orderNavItems, isDefaultNavOrder } from '@/lib/nav-items'
import { useNavOrder } from '@/lib/use-nav-order'

interface Account {
  name: string
  email: string
  avatarUrl: string | null
  avatarPublic: boolean
  isOAuth: boolean
}

export default function SettingsHubPage() {
  const [account, setAccount] = useState<Account | null>(null)
  const savedOrder = useNavOrder()
  const customOrder = useMemo(
    () => !isDefaultNavOrder(orderNavItems(savedOrder).map(i => i.href)),
    [savedOrder],
  )

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, avatar_public')
        .eq('id', user.id)
        .single()
      setAccount({
        name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: user.email ?? '',
        avatarUrl: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
        avatarPublic: profile?.avatar_public ?? false,
        isOAuth: (user.identities ?? []).some(i => i.provider !== 'email'),
      })
    })
  }, [])

  // Small right-aligned status per section so the hub is informative at a glance
  const hint = (key: string): string | null => {
    if (key === 'profile') {
      if (!account) return null
      return account.avatarUrl ? (account.avatarPublic ? 'Photo visible to friends' : 'Photo private') : 'No photo yet'
    }
    if (key === 'security') {
      if (!account) return null
      return account.isOAuth ? 'Google sign-in' : 'Password'
    }
    if (key === 'navigation') return customOrder ? 'Custom order' : 'Default order'
    return null
  }

  const initials = account?.name
    ? account.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : (account?.email.charAt(0).toUpperCase() ?? '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and personalise the app</p>
      </div>

      {/* Account summary */}
      <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
        <Avatar className="w-14 h-14">
          {account?.avatarUrl && <AvatarImage src={account.avatarUrl} alt="Profile picture" className="object-cover" />}
          <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold truncate">{account ? (account.name || 'Your account') : ' '}</p>
          <p className="text-sm text-muted-foreground truncate">{account?.email ?? ' '}</p>
        </div>
      </div>

      {/* Options — each opens its own page */}
      <div className="space-y-2.5">
        {SETTINGS_SECTIONS.map(({ key, href, title, description, icon: Icon }) => {
          const h = hint(key)
          return (
            <Link
              key={key}
              href={href}
              className="group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-all hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
              </span>
              {h && <span className="hidden sm:block text-xs text-muted-foreground shrink-0">{h}</span>}
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
