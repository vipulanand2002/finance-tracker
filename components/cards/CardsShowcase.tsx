'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight, FileUp, GalleryHorizontal, Layers, LayoutGrid, List, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import CardDisplay, { type CardData } from './CardDisplay'

export type CardsView = 'carousel' | 'grid' | 'stack' | 'list'

export const CARD_VIEWS: { value: CardsView; label: string; icon: typeof List }[] = [
  { value: 'carousel', label: 'Scroll', icon: GalleryHorizontal },
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
  { value: 'stack', label: 'Stack', icon: Layers },
  { value: 'list', label: 'List', icon: List },
]

const NETWORK_LABEL: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', rupay: 'RuPay', amex: 'Amex', other: '' }

export function ViewSwitcher({ value, onChange }: { value: CardsView; onChange: (v: CardsView) => void }) {
  return (
    <div className="flex items-center bg-muted rounded-lg p-0.5" role="group" aria-label="Card layout">
      {CARD_VIEWS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={label}
          aria-pressed={value === v}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors',
            value === v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

interface Props {
  cards: CardData[]
  view: CardsView
  /** The card the analytics below are showing ('all' = none in particular) */
  selectedId: string
  onSelect: (id: string) => void
  /** Amount still due on a card, and whether it has any transactions at all */
  status: (cardId: string) => { due: number; hasTxs: boolean }
  onImport: (card: CardData) => void
  onEdit: (card: CardData) => void
  onDelete: (id: string) => void
}

export default function CardsShowcase({ cards, view, selectedId, onSelect, status, onImport, onEdit, onDelete }: Props) {
  const scroller = useRef<HTMLDivElement>(null)

  const select = (id: string) => onSelect(selectedId === id ? 'all' : id)

  const dueLine = (card: CardData) => {
    const s = status(card.id)
    return s.due > 0
      ? <p className="text-xs font-medium text-red-500">Due: {formatCurrency(s.due)}</p>
      : s.hasTxs ? <p className="text-xs font-medium text-emerald-600">Fully paid</p> : null
  }

  const actions = (card: CardData) => (
    <div className="flex items-center gap-1 shrink-0">
      <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary" title="Import PDF statement" onClick={() => onImport(card)}>
        <FileUp className="w-3.5 h-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="w-8 h-8" title="Edit card" onClick={() => onEdit(card)}>
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" title="Remove card" onClick={() => onDelete(card.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )

  const infoRow = (card: CardData) => (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-medium truncate">{card.card_name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs capitalize">{card.card_type}</Badge>
          {card.network !== 'other' && <Badge variant="secondary" className="text-xs">{NETWORK_LABEL[card.network]}</Badge>}
        </div>
        {dueLine(card)}
      </div>
      {actions(card)}
    </div>
  )

  const selectable = (card: CardData, children: React.ReactNode) => (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectedId === card.id}
      onClick={() => select(card.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(card.id) } }}
      className={cn(
        'rounded-2xl cursor-pointer transition-shadow outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-primary',
        selectedId === card.id && 'ring-2 ring-primary',
      )}
    >
      {children}
    </div>
  )

  // ── Scroll: one row, swipe or use the arrows ──
  if (view === 'carousel') {
    const by = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 380, behavior: 'smooth' })
    return (
      <div className="relative group">
        {cards.length > 1 && (
          <>
            <Button variant="secondary" size="icon" className="hidden md:flex absolute -left-3 top-[30%] z-10 h-9 w-9 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => by(-1)} aria-label="Scroll left">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon" className="hidden md:flex absolute -right-3 top-[30%] z-10 h-9 w-9 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => by(1)} aria-label="Scroll right">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
        <div
          ref={scroller}
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-3 pt-1 px-1 -mx-1 [scrollbar-width:thin]"
        >
          {cards.map(card => (
            <div key={card.id} className="snap-center shrink-0 w-[86%] sm:w-[380px] space-y-3">
              {selectable(card, <CardDisplay card={card} />)}
              {infoRow(card)}
            </div>
          ))}
          {/* a little room so the last card can be centred */}
          <div className="shrink-0 w-1" aria-hidden />
        </div>
      </div>
    )
  }

  // ── Grid: everything at once ──
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map(card => (
          <div key={card.id} className="space-y-3">
            {selectable(card, <CardDisplay card={card} />)}
            {infoRow(card)}
          </div>
        ))}
      </div>
    )
  }

  // ── Stack: a wallet-style pile; tap a card to bring it forward ──
  if (view === 'stack') {
    const active = Math.max(0, cards.findIndex(c => c.id === selectedId))
    const current = cards[active]
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="pb-2">
          {cards.map((card, i) => (
            <div
              key={card.id}
              // Margins in % are relative to the width, and a card's height is 63% of it:
              // pulling each card up 45% leaves its top strip showing; the card right after the
              // active one drops below it, so the active card is fully visible.
              style={{ marginTop: i === 0 ? 0 : i - 1 === active ? '10px' : '-45%', zIndex: i }}
              className="relative transition-[margin] duration-300"
            >
              <div
                role="button"
                tabIndex={0}
                aria-pressed={i === active && selectedId !== 'all'}
                onClick={() => onSelect(card.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(card.id) } }}
                className="rounded-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <CardDisplay card={card} />
              </div>
            </div>
          ))}
        </div>
        {current && (
          <div className="rounded-xl border bg-card p-3 space-y-1">
            {infoRow(current)}
          </div>
        )}
      </div>
    )
  }

  // ── List: compact rows ──
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {cards.map(card => (
        <li
          key={card.id}
          onClick={() => select(card.id)}
          className={cn('flex items-center gap-4 p-3 cursor-pointer transition-colors hover:bg-muted/40', selectedId === card.id && 'bg-primary/5')}
        >
          <div className="w-28 sm:w-36 shrink-0"><CardDisplay card={card} compact /></div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium truncate">{card.card_name}</p>
            <p className="text-xs text-muted-foreground truncate">{card.bank_name} · •••• {card.last_four}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs capitalize">{card.card_type}</Badge>
              {card.network !== 'other' && <Badge variant="secondary" className="text-xs">{NETWORK_LABEL[card.network]}</Badge>}
              {dueLine(card)}
            </div>
          </div>
          <div onClick={e => e.stopPropagation()}>{actions(card)}</div>
        </li>
      ))}
    </ul>
  )
}
