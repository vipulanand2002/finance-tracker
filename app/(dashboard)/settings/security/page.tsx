'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Lock } from 'lucide-react'

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(true)
  const [isOAuth, setIsOAuth] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setIsOAuth((user.identities ?? []).some(i => i.provider !== 'email'))
      setLoading(false)
    })
  }, [])

  async function savePassword() {
    if (!newPassword) { toast.error('Enter a new password'); return }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    setSavingPassword(true)
    const { error } = await createClient().auth.updateUser({ password: newPassword })
    if (error) toast.error(error.message)
    else { toast.success('Password updated!'); setNewPassword(''); setConfirmPassword('') }
    setSavingPassword(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isOAuth) {
    return (
      <Card>
        <CardContent className="py-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Google account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You signed in with Google — password management is handled by your Google account.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && savePassword()}
          />
        </div>
        <Button
          className="w-full"
          onClick={savePassword}
          disabled={savingPassword || !newPassword || !confirmPassword}
        >
          {savingPassword
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Lock className="w-4 h-4 mr-2" />}
          Update password
        </Button>
      </CardContent>
    </Card>
  )
}
