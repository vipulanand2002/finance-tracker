'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Check, UserPlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Friend } from '@/types'

interface Props {
  friends: Friend[]
  onSelect: (friend: Friend) => void
  isSelected: (email: string) => boolean
  placeholder?: string
}

export function FriendPicker({ friends, onSelect, isSelected, placeholder = 'Search friends to add…' }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? friends.filter(f => f.email.toLowerCase().includes(query.toLowerCase()))
    : friends

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (friends.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto">
          {filtered.map(f => {
            const selected = isSelected(f.email)
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  if (!selected) { onSelect(f); setQuery('') }
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  selected
                    ? 'text-muted-foreground cursor-default'
                    : 'hover:bg-accent hover:text-accent-foreground cursor-pointer'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-[10px] shrink-0">
                  {f.email.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{f.email}</span>
                {selected
                  ? <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  : <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
