'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// "Paste UPI SMS": reading the clipboard from script needs a browser permission
// that many setups never grant (the Android app's WebView, installed PWA, Firefox,
// or "Block" tapped once). So: the Android app's native bridge first, then the web
// clipboard API, and if both fail a text box — a long-press → Paste into a text
// field is the system paste and needs no permission.
export function usePasteSms() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const go = (text: string) => router.push(`/share?text=${encodeURIComponent(text)}`)

  async function pasteSms() {
    // Inside the Android app the WebView can't read the clipboard, but the app can
    try {
      const native = window.AndroidApp?.readClipboard?.()
      if (native?.trim()) { go(native); return }
    } catch { /* older app build or bridge error — try the web API */ }
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported')
      const text = await navigator.clipboard.readText()
      if (text.trim()) { go(text); return }
    } catch { /* permission denied or unsupported — fall back to manual paste */ }
    setOpen(true)
  }

  const dialog = <PasteSmsDialog open={open} onClose={() => setOpen(false)} onSubmit={go} />
  return { pasteSms, dialog }
}

function PasteSmsDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) { toast.warning('Paste the SMS text first'); return }
    onSubmit(text)
    setText('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paste UPI SMS</DialogTitle>
          <DialogDescription>
            Long-press the box below and tap <strong>Paste</strong>, or type the message. We’ll read the amount, merchant and date from it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            autoFocus
            placeholder="e.g. Rs.250.00 debited from A/c XX1234 on 21-Oct-26 to VPA swiggy@icici…"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
