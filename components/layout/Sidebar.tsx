'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { LogOut, TrendingUp } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { orderNavItems } from '@/lib/nav-items'
import { useNavOrder, syncNavOrderFromAccount } from '@/lib/use-nav-order'

interface SidebarProps {
  email: string
  onClose?: () => void
}

export default function Sidebar({ email, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('')
  // The user's custom menu order (set in Settings → Navigation), cached locally.
  const navItems = orderNavItems(useNavOrder())

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      // Account-level order wins (follows the user across devices / browsers)
      syncNavOrderFromAccount(user.user_metadata?.nav_order)
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, full_name')
        .eq('id', user.id)
        .single()
      setAvatarUrl(profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null)
      setDisplayName(
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        ''
      )
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <div className="flex flex-col h-full bg-card border-r">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm">Finance Tracker</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-7 h-7">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" />}
            <AvatarFallback className="text-xs">
              {(displayName || email).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            {displayName && <p className="text-xs font-medium truncate leading-tight">{displayName}</p>}
            <p className="text-xs text-muted-foreground truncate leading-tight">{email}</p>
          </div>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
