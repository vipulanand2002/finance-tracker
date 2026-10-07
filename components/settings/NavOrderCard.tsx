'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronUp, ChevronDown, RotateCcw, Check, Loader2, ListOrdered, TrendingUp, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { NAV_ITEMS, orderNavItems, isDefaultNavOrder, type NavItem } from '@/lib/nav-items'
import { useNavOrder, setCachedNavOrder } from '@/lib/use-nav-order'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ── One row of the reorder list ───────────────────────────────────────────────
function RowBody({
  item, index, total, onMove, handleProps, floating = false,
}: {
  item: NavItem
  index: number
  total: number
  onMove?: (dir: -1 | 1) => void
  handleProps?: React.HTMLAttributes<HTMLButtonElement>
  floating?: boolean
}) {
  const Icon = item.icon
  const moved = NAV_ITEMS.findIndex(n => n.href === item.href) !== index
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors',
        floating
          ? 'shadow-xl ring-2 ring-primary/50 scale-[1.02] cursor-grabbing'
          : 'hover:border-primary/40 hover:bg-muted/30',
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${item.label} to reorder`}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground rounded-md p-1 -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...handleProps}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span className="w-6 h-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold tabular-nums flex items-center justify-center">
        {index + 1}
      </span>

      <span className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>

      <span className="flex-1 min-w-0 text-sm font-medium truncate">
        {item.label}
        {moved && <span className="ml-2 align-middle text-[10px] font-normal text-muted-foreground">moved</span>}
      </span>

      {onMove && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            aria-label={`Move ${item.label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`Move ${item.label} down`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function SortableRow({ item, index, total, onMove }: { item: NavItem; index: number; total: number; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-30')}
    >
      <RowBody
        item={item} index={index} total={total} onMove={onMove}
        handleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  )
}

// ── Live preview of the sidebar — rows glide to their new slot ───────────────
const PREVIEW_ROW = 36 // px per row (32 + 4 gap)
function SidebarPreview({ items }: { items: NavItem[] }) {
  return (
    <div className="rounded-2xl border bg-muted/30 p-3">
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-xs font-semibold">Finance Tracker</span>
        </div>
        <div className="relative p-2" style={{ height: items.length * PREVIEW_ROW + 16 }}>
          {NAV_ITEMS.map(base => {
            const index = items.findIndex(i => i.href === base.href)
            const Icon = base.icon
            const active = base.href === '/settings'
            return (
              <div
                key={base.href}
                className={cn(
                  'absolute left-2 right-2 flex items-center gap-2.5 rounded-md px-2.5 text-xs transition-transform duration-300 ease-out',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
                style={{ height: 32, transform: `translateY(${8 + index * PREVIEW_ROW}px)` }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{base.label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-2.5">Live preview of your sidebar</p>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export default function NavOrderCard() {
  const saved = useNavOrder()
  const items = useMemo(() => orderNavItems(saved), [saved])
  const hrefs = useMemo(() => items.map(i => i.href), [items])
  const isDefault = isDefaultNavOrder(hrefs)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<SaveState>('idle')
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Apply instantly (sidebar + preview), then persist to the account.
  async function commit(next: string[] | null) {
    setCachedNavOrder(next)
    const id = ++seq.current
    clearTimeout(timer.current)
    setStatus('saving')
    const { error } = await createClient().auth.updateUser({ data: { nav_order: next } })
    if (id !== seq.current) return // a newer change superseded this save
    if (error) {
      setStatus('error')
      toast.error('Could not sync your menu order — it is saved on this device only.')
      return
    }
    setStatus('saved')
    timer.current = setTimeout(() => setStatus('idle'), 2200)
  }

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)) }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = hrefs.indexOf(String(active.id))
    const to = hrefs.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    commit(arrayMove(hrefs, from, to))
  }
  function move(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= hrefs.length) return
    commit(arrayMove(hrefs, index, to))
  }

  const activeItem = activeId ? items.find(i => i.href === activeId) : null
  const activeIndex = activeItem ? items.indexOf(activeItem) : 0

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="w-4 h-4" />Menu order
              {!isDefault && (
                <span className="text-[10px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5">Custom order</span>
              )}
            </CardTitle>
            <CardDescription className="mt-1.5">
              Put your favourite pages first. Drag the handle, or use the arrows — your sidebar updates instantly.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              aria-live="polite"
              className={cn(
                'flex items-center gap-1 text-xs transition-opacity',
                status === 'idle' ? 'opacity-0' : 'opacity-100',
                status === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {status === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>}
              {status === 'saved' && <><Check className="w-3.5 h-3.5 text-emerald-600" />Saved</>}
              {status === 'error' && <><AlertCircle className="w-3.5 h-3.5" />Not synced</>}
            </span>
            <Button variant="outline" size="sm" disabled={isDefault} onClick={() => commit(null)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Reset
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          <div className="xl:col-span-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={hrefs} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <SortableRow key={item.href} item={item} index={i} total={items.length} onMove={dir => move(i, dir)} />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeItem ? <RowBody item={activeItem} index={activeIndex} total={items.length} floating /> : null}
              </DragOverlay>
            </DndContext>
          </div>

          <div className="xl:col-span-2 xl:sticky xl:top-2">
            <SidebarPreview items={items} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
