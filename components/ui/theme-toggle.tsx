'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return <div className="w-9 h-5 rounded-full bg-muted animate-pulse" />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className="relative flex items-center w-9 h-5 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: isDark ? 'oklch(0.488 0.243 264.376)' : 'oklch(0.708 0 0)' }}
    >
      <span
        className="absolute flex items-center justify-center w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300"
        style={{ left: isDark ? '18px' : '2px' }}
      >
        {isDark
          ? <Moon className="w-2.5 h-2.5 text-slate-700" />
          : <Sun className="w-2.5 h-2.5 text-amber-500" />}
      </span>
    </button>
  )
}
