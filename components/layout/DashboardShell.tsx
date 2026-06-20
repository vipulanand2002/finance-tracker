'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import NotificationBell from './NotificationBell'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

export default function DashboardShell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col">
        <Sidebar email={email} />
      </aside>

      {/* Mobile sidebar drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-56">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar email={email} onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header — hamburger on mobile, notification bell on all screens */}
        <header className="flex items-center justify-between h-14 px-4 border-b bg-card shrink-0">
          <div className="flex items-center gap-3 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <span className="font-semibold text-sm">Finance Tracker</span>
          </div>

          {/* Spacer on desktop so bell stays right */}
          <div className="hidden md:block" />

          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
