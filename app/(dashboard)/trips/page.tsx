'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { format, parseISO, isValid } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, MapPin, Calendar, Pencil, Trash2, Plane, Receipt, LockKeyhole, Users } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import TripModal from '@/components/trips/TripModal'
import TripDetailSheet from '@/components/trips/TripDetailSheet'
import type { Trip } from '@/types'

const TRIP_COLORS = [
  'from-violet-500 to-purple-700',
  'from-rose-400 to-pink-700',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-700',
  'from-sky-400 to-blue-700',
  'from-fuchsia-400 to-violet-700',
]

function tripGradient(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % TRIP_COLORS.length
  return TRIP_COLORS[h]
}

function safeFormat(dateStr: string | null | undefined, fmt: string) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  return isValid(d) ? format(d, fmt) : null
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [detailTripId, setDetailTripId] = useState<string | null>(null)
  // Derive detailTrip from trips state so it always reflects the latest fetched data
  const detailTrip = trips.find(t => t.id === detailTripId) ?? null

  const fetchTrips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trips')
      const data = await res.json()
      setTrips(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load trips')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  async function deleteTrip(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this trip? Linked transactions will be unlinked.')) return
    try {
      await fetch(`/api/trips?id=${id}`, { method: 'DELETE' })
      toast.success('Trip deleted')
      if (detailTripId === id) setDetailTripId(null)
      fetchTrips()
    } catch {
      toast.error('Failed to delete trip')
    }
  }

  const totalAllTrips = trips.reduce((s, t) => s + (t.total_spent ?? 0), 0)
  const activeTrips = trips.filter(t => {
    if (!t.end_date) return true
    return new Date(t.end_date) >= new Date()
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trips</h1>
          <p className="text-muted-foreground text-sm">Track expenses for each trip</p>
        </div>
        <Button onClick={() => { setEditTrip(null); setModalOpen(true) }}>
          <Plus className="w-4 h-4 mr-1" /> New Trip
        </Button>
      </div>

      {/* Summary bar */}
      {trips.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Total Trips</p>
              <p className="text-xl sm:text-2xl font-bold mt-0.5">{trips.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Active</p>
              <p className="text-xl sm:text-2xl font-bold mt-0.5">{activeTrips.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Spent</p>
              <p className="text-base sm:text-2xl font-bold mt-0.5 text-red-600 truncate">{formatCurrency(totalAllTrips)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trip cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="py-24 flex flex-col items-center text-center gap-3">
            <Plane className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-lg">No trips yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a trip to start tracking expenses</p>
            </div>
            <Button onClick={() => { setEditTrip(null); setModalOpen(true) }}>
              <Plus className="w-4 h-4 mr-1" /> Create your first trip
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map(trip => {
            const budgetPct = trip.budget_total && trip.budget_total > 0
              ? Math.min(((trip.total_spent ?? 0) / trip.budget_total) * 100, 100)
              : null
            const overBudget = trip.budget_total && (trip.total_spent ?? 0) > trip.budget_total

            return (
              <div
                key={trip.id}
                onClick={() => setDetailTripId(trip.id)}
                className="rounded-2xl overflow-hidden border bg-card cursor-pointer hover:shadow-md transition-shadow group"
              >
                {/* Cover image / gradient */}
                <div className="relative h-36">
                  {trip.image_url ? (
                    <img src={trip.image_url} alt={trip.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${tripGradient(trip.name)}`} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                  {/* Action buttons — always visible on mobile, hover-reveal on desktop */}
                  {trip.is_owner !== false && (
                    <div className="absolute top-2 right-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setEditTrip(trip); setModalOpen(true) }}
                        className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 active:bg-black/70"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => deleteTrip(trip.id, e)}
                        className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600 active:bg-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Trip name overlay */}
                  <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-1">
                    <p className="text-white font-semibold text-sm leading-tight truncate">{trip.name}</p>
                    {trip.is_owner === false ? (
                      <span className="flex items-center gap-1 shrink-0 text-white/80 text-xs bg-black/30 rounded px-1.5 py-0.5">
                        <Users className="w-3 h-3" /> Member
                      </span>
                    ) : trip.is_closed && (
                      <span className="flex items-center gap-1 shrink-0 text-white/80 text-xs bg-black/30 rounded px-1.5 py-0.5">
                        <LockKeyhole className="w-3 h-3" /> Closed
                      </span>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-3 space-y-2">
                  {/* Destination + dates */}
                  <div className="space-y-1">
                    {trip.destination && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{trip.destination}</span>
                      </div>
                    )}
                    {(trip.start_date || trip.end_date) && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>
                          {safeFormat(trip.start_date, 'dd MMM yyyy')}
                          {trip.end_date && ` — ${safeFormat(trip.end_date, 'dd MMM yyyy')}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Spent + transaction count */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Spent</p>
                      <p className={`text-base font-bold ${overBudget ? 'text-red-600' : ''}`}>
                        {formatCurrency(trip.total_spent ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Receipt className="w-3.5 h-3.5" />
                      {trip.transaction_count ?? 0} transactions
                    </div>
                  </div>

                  {/* Budget progress */}
                  {budgetPct !== null && (
                    <div className="space-y-1">
                      <Progress
                        value={budgetPct}
                        className={`h-1.5 ${overBudget ? '[&>div]:bg-red-500' : ''}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{overBudget ? <span className="text-red-600">Over budget</span> : 'Budget'}</span>
                        <span>{formatCurrency(trip.budget_total!)}</span>
                      </div>
                    </div>
                  )}

                  {/* Category budget badges */}
                  {(trip.trip_budgets?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {trip.trip_budgets!.slice(0, 3).map(b => (
                        <Badge key={b.id} variant="secondary" className="text-xs">{b.category}</Badge>
                      ))}
                      {trip.trip_budgets!.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{trip.trip_budgets!.length - 3}</Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <TripModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTrip(null) }}
        onSaved={fetchTrips}
        trip={editTrip}
      />

      <TripDetailSheet
        trip={detailTrip}
        open={Boolean(detailTripId)}
        onClose={() => setDetailTripId(null)}
        onUpdated={fetchTrips}
      />
    </div>
  )
}
