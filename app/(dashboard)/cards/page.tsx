'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Plus, CreditCard, Pencil, Trash2, FileUp } from 'lucide-react'
import CardDisplay, { type CardData } from '@/components/cards/CardDisplay'
import CardModal from '@/components/cards/CardModal'
import CardPDFImport from '@/components/cards/CardPDFImport'

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', rupay: 'RuPay', amex: 'Amex', other: '',
}

export default function CardsPage() {
  const [cards, setCards] = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editCard, setEditCard] = useState<CardData | null>(null)
  const [pdfCard, setPdfCard] = useState<CardData | null>(null)

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cards')
      const data = await res.json()
      setCards(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCards() }, [fetchCards])

  async function deleteCard(id: string) {
    if (!confirm('Remove this card?')) return
    try {
      await fetch(`/api/cards?id=${id}`, { method: 'DELETE' })
      toast.success('Card removed')
      fetchCards()
    } catch {
      toast.error('Failed to remove card')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cards</h1>
          <p className="text-muted-foreground text-sm">Manage your credit and debit cards</p>
        </div>
        <Button onClick={() => { setEditCard(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4 mr-1" /> Add Card
        </Button>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="py-20 flex flex-col items-center text-center gap-3">
            <CreditCard className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-medium">No cards yet</p>
              <p className="text-sm text-muted-foreground">Add your credit or debit cards to manage them here</p>
            </div>
            <Button onClick={() => { setEditCard(null); setModalOpen(true) }}>
              <Plus className="w-4 h-4 mr-1" /> Add your first card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(card => (
            <div key={card.id} className="space-y-3">
              <CardDisplay card={card} />

              {/* Card info + actions */}
              <div className="flex items-center justify-between px-1">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium truncate">{card.card_name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs capitalize">{card.card_type}</Badge>
                    {card.network !== 'other' && (
                      <Badge variant="secondary" className="text-xs">{NETWORK_LABEL[card.network]}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-8 h-8 text-muted-foreground hover:text-primary"
                    title="Import PDF statement"
                    onClick={() => setPdfCard(card)}
                  >
                    <FileUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-8 h-8"
                    title="Edit card"
                    onClick={() => { setEditCard(card); setModalOpen(true) }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-8 h-8 text-muted-foreground hover:text-destructive"
                    title="Remove card"
                    onClick={() => deleteCard(card.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CardModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditCard(null) }}
        onSaved={fetchCards}
        card={editCard}
      />

      <CardPDFImport
        open={Boolean(pdfCard)}
        onClose={() => setPdfCard(null)}
        onImported={fetchCards}
        cardId={pdfCard?.id}
        cardName={pdfCard?.card_name}
        savedPassword={pdfCard?.pdf_password}
      />
    </div>
  )
}
