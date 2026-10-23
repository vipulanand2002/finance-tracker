'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2, LogOut, RefreshCw, ShieldX, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

type Approval = 'approved' | 'pending' | 'rejected'

// Shown to anyone who has signed up but hasn't been approved by the admin yet.
export default function PendingApprovalPage() {
  const router = useRouter()
  const [approval, setApproval] = useState<Approval>('pending')
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/access/status', { cache: 'no-store' })
      if (res.ok) {
        const { approval: a } = await res.json() as { approval: Approval }
        setApproval(a)
        if (a === 'approved') router.replace('/dashboard')
      }
    } finally {
      setChecking(false)
    }
  }, [router])

  useEffect(() => {
    // Register the request (once) so it shows up for the admin, then watch for the answer
    fetch('/api/access/request', { method: 'POST' }).then(check).catch(() => {})
    createClient().auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''))
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [check])

  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
  }

  const rejected = approval === 'rejected'

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            {rejected ? <ShieldX className="w-6 h-6 text-destructive" /> : <Clock className="w-6 h-6 text-primary" />}
            {rejected ? 'Access not granted' : 'Waiting for approval'}
          </CardTitle>
          <CardDescription>
            {rejected
              ? 'Your request to use Finance Tracker wasn’t approved.'
              : 'Your request has been sent to Vipul Anand. You’ll get access as soon as it’s approved.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {email && <p className="text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span></p>}
          {!rejected && (
            <p className="text-xs text-muted-foreground">This page updates on its own — you can leave it open or come back later.</p>
          )}
          <div className="flex items-center justify-center gap-2">
            {!rejected && (
              <Button variant="outline" onClick={check} disabled={checking}>
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Check again
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}><LogOut className="w-4 h-4 mr-2" /> Sign out</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
