import { NextResponse } from 'next/server'

// Identifies the live deployment. The Android app polls this and shows a
// notification when the id changes (i.e. a new version has been deployed).
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      id: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      message: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '').split('\n')[0].slice(0, 140),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
