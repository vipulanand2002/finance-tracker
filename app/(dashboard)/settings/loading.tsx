import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
      </div>
    </div>
  )
}
