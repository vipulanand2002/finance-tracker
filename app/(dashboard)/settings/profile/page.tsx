'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Loader2, Mail, Camera, Trash2, Eye } from 'lucide-react'

export default function ProfileSettingsPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [avatarPublic, setAvatarPublic] = useState(false)
  const [savingAvatarPublic, setSavingAvatarPublic] = useState(false)

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, avatar_public')
        .eq('id', user.id)
        .single()

      setDisplayName(
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        ''
      )
      setAvatarUrl(profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null)
      setAvatarPublic(profile?.avatar_public ?? false)
      setLoading(false)
    })
  }, [])

  async function saveName() {
    if (!displayName.trim()) { toast.error('Name cannot be empty'); return }
    setSavingName(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } })
    if (error) { toast.error(error.message); setSavingName(false); return }
    await supabase.from('profiles').update({ full_name: displayName.trim() }).eq('id', userId)
    toast.success('Name updated!')
    setSavingName(false)
  }

  async function toggleAvatarPublic(val: boolean) {
    setSavingAvatarPublic(true)
    setAvatarPublic(val)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ avatar_public: val }).eq('id', userId)
    if (error) { toast.error(error.message); setAvatarPublic(!val) }
    else toast.success(val ? 'Profile picture now visible to friends' : 'Profile picture hidden from friends')
    setSavingAvatarPublic(false)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }

    setUploadingAvatar(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${userId}/avatar.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) { toast.error(upErr.message); setUploadingAvatar(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ avatar_url: urlWithBust })
      .eq('id', userId)
    if (profileErr) { toast.error('Failed to save: ' + profileErr.message); setUploadingAvatar(false); return }

    await supabase.auth.updateUser({ data: { avatar_url: urlWithBust } })
    setAvatarUrl(urlWithBust)
    toast.success('Profile picture updated!')
    setUploadingAvatar(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function removeAvatar() {
    setUploadingAvatar(true)
    const supabase = createClient()
    await supabase.storage.from('avatars').remove([
      `${userId}/avatar.jpg`, `${userId}/avatar.png`,
      `${userId}/avatar.webp`, `${userId}/avatar.gif`,
    ])
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } })
    if (error) toast.error(error.message)
    else {
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
      setAvatarUrl(null)
      toast.success('Profile picture removed')
    }
    setUploadingAvatar(false)
  }

  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : email.charAt(0).toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Avatar + form: side-by-side on desktop, stacked on mobile */}
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Avatar column */}
          <div className="flex flex-col items-center gap-3 sm:w-36 shrink-0">
            <div className="relative group">
              <Avatar className="w-24 h-24">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile picture" className="object-cover" />}
                <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                  {uploadingAvatar ? <Loader2 className="w-6 h-6 animate-spin" /> : initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-1.5 w-full">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar
                  ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  : <Camera className="w-3.5 h-3.5 mr-1" />}
                {avatarUrl ? 'Change' : 'Upload'}
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-destructive hover:text-destructive"
                  onClick={removeAvatar}
                  disabled={uploadingAvatar}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />Remove
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground text-center leading-snug mt-0.5">
                JPG, PNG, WebP · max 5 MB
              </p>
            </div>
          </div>

          {/* Form fields column */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Visibility toggle — only shown when avatar is set */}
            {avatarUrl && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">Visible to friends</p>
                    <p className="text-xs text-muted-foreground leading-snug">Friends can see your photo in chats and emails</p>
                  </div>
                </div>
                <Switch
                  checked={avatarPublic}
                  onCheckedChange={toggleAvatarPublic}
                  disabled={savingAvatarPublic}
                  className="ml-3 shrink-0"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <div className="flex gap-2">
                <Input
                  id="displayName"
                  placeholder="Your full name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  className="flex-1"
                />
                <Button onClick={saveName} disabled={savingName || !displayName.trim()}>
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email} readOnly disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="w-3 h-3" />Email cannot be changed here.
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleAvatarChange}
      />
    </Card>
  )
}
