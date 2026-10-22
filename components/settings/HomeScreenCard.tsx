'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Smartphone, Download, Zap, MousePointerClick } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function HomeScreenCard() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setInstalled(window.matchMedia('(display-mode: standalone)').matches))
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" /> Android app with widget</CardTitle>
          <CardDescription>A real home-screen widget with one-tap + Expense and + Income buttons.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>Download <strong className="text-foreground">FinanceTracker.apk</strong> and open it (allow “install unknown apps” if asked).</li>
            <li>Press and hold an empty spot on your home screen → <strong className="text-foreground">Widgets</strong> → <strong className="text-foreground">Finance Tracker</strong>.</li>
            <li>Drop the Quick add widget where you like and sign in once in the app.</li>
          </ol>
          <a href="https://github.com/vipulanand2002/finance-tracker/releases/tag/android-latest" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" /> Get the Android app</Button>
          </a>
          <p className="text-xs text-muted-foreground">The app always shows the latest version of this site, so you only reinstall it when the widget itself changes. Use email &amp; password to sign in (Google sign-in is blocked inside app windows).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" /> Install on your phone</CardTitle>
          <CardDescription>Put Finance Tracker on your home screen so it opens like an app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {installed ? (
            <p className="text-sm text-emerald-600 font-medium">Installed — you’re using the app right now.</p>
          ) : installEvent ? (
            <Button onClick={install}><Download className="w-4 h-4 mr-2" /> Install app</Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open this page in Chrome (Android) or Safari (iPhone), then use the browser menu → <strong>Install app</strong> / <strong>Add to Home Screen</strong>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> One-tap “Quick add” icon</CardTitle>
          <CardDescription>A separate home-screen icon that opens straight to adding a transaction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>Tap <strong className="text-foreground">Open Quick add</strong> below.</li>
            <li>In the browser menu choose <strong className="text-foreground">Add to Home screen</strong> (Android: menu ⋮ → Add to Home screen → Create shortcut).</li>
            <li>Tap the new icon any time to start adding right away.</li>
          </ol>
          <div className="flex gap-2 flex-wrap">
            <Link href="/add?type=expense"><Button variant="outline" size="sm">Open Quick add</Button></Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MousePointerClick className="w-5 h-5 text-primary" /> Long-press shortcuts</CardTitle>
          <CardDescription>Once the app is installed, press and hold its icon.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>You’ll see <strong className="text-foreground">Add expense</strong>, <strong className="text-foreground">Add income</strong>, Splits and Trips. Drag one onto your home screen to keep it as its own icon.</p>
          <p className="text-xs">Phones don’t allow live widgets for web apps, so these shortcuts are the closest equivalent.</p>
        </CardContent>
      </Card>
    </div>
  )
}
