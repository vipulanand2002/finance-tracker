'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTIONS } from '@/lib/settings-sections'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = SETTINGS_SECTIONS.find(s => pathname === s.href || pathname.startsWith(s.href + '/'))

  // The hub (/settings) renders its own header and option list.
  if (!current) return <div className="max-w-2xl">{children}</div>

  return (
    <div className="space-y-5">
      {/* Mobile: simple back link to the hub */}
      <Link
        href="/settings"
        className="md:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />Settings
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        {/* Desktop: side menu to jump between settings without going back */}
        <aside className="hidden md:block space-y-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />All settings
          </Link>
          <nav className="space-y-1">
            {SETTINGS_SECTIONS.map(({ key, href, title, icon: Icon }) => {
              const active = key === current.key
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {title}
                </Link>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{current.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">{current.pageDescription}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
