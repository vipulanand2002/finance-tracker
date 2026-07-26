import Link from 'next/link'
import { Play, ArrowRight } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4 py-8 gap-5">
      {/* Demo teaser */}
      <Link
        href="/demo"
        className="flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-sm hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <Play className="w-3.5 h-3.5 text-primary" />
        See a live demo — no account needed
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>

      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
