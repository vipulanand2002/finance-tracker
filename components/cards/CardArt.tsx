import { useId } from 'react'
import type { PatternKind } from '@/lib/card-catalog'

// Decorative artwork drawn over a card's gradient. Everything is vector, in a fixed
// 400×252 box that is scaled to cover the card (same ratio as a real card).

export function CardPattern({ kind, color }: { kind: PatternKind; color: string }) {
  const uid = useId().replace(/:/g, '')
  if (kind === 'none') return null

  let body: React.ReactNode = null
  switch (kind) {
    case 'waves':
      body = (
        <g fill="none" stroke={color} strokeWidth="1.2">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M-20 ${112 + i * 13} C 80 ${52 + i * 13}, 170 ${205 + i * 9}, 270 ${128 + i * 11} S 410 ${84 + i * 13}, 430 ${150 + i * 11}`} />
          ))}
        </g>
      )
      break
    case 'swoosh':
      body = (
        <g fill={color}>
          <path d="M-10 214 C 120 140, 250 262, 420 112 L420 270 L-10 270Z" opacity=".9" />
          <path d="M-10 168 C 110 100, 240 214, 420 70 L420 96 C 250 238, 120 126, -10 196Z" opacity=".55" />
        </g>
      )
      break
    case 'geo':
      body = (
        <g fill={color}>
          <polygon points="0,0 170,0 62,128" opacity=".9" />
          <polygon points="170,0 340,0 214,152" opacity=".55" />
          <polygon points="340,0 400,0 400,146 270,206" opacity=".75" />
          <polygon points="0,252 0,120 110,182 80,252" opacity=".6" />
          <polygon points="80,252 110,182 246,214 220,252" opacity=".9" />
          <polygon points="246,214 270,206 400,146 400,252 220,252" opacity=".45" />
        </g>
      )
      break
    case 'hex':
      body = (
        <>
          <defs>
            <pattern id={`hx${uid}`} width="34" height="58.8" patternUnits="userSpaceOnUse">
              <path d="M17 0 L34 9.8 L34 29.4 L17 39.2 L0 29.4 L0 9.8Z M17 39.2 L17 58.8 M34 29.4 L51 39.2 M0 29.4 L-17 39.2" fill="none" stroke={color} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="400" height="252" fill={`url(#hx${uid})`} />
        </>
      )
      break
    case 'lines':
      body = (
        <>
          <defs>
            <pattern id={`ln${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
              <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="1.4" />
            </pattern>
          </defs>
          <rect width="400" height="252" fill={`url(#ln${uid})`} />
        </>
      )
      break
    case 'rings':
      body = (
        <g fill="none" stroke={color} strokeWidth="1.2">
          {[36, 66, 98, 132, 168, 206, 246].map(r => <circle key={r} cx="352" cy="38" r={r} />)}
        </g>
      )
      break
    case 'dots':
      body = (
        <>
          <defs>
            <pattern id={`dt${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill={color} />
            </pattern>
          </defs>
          <rect width="400" height="252" fill={`url(#dt${uid})`} />
        </>
      )
      break
    case 'stripes':
      body = (
        <g fill={color}>
          <polygon points="230,0 290,0 120,252 60,252" opacity=".7" />
          <polygon points="310,0 340,0 170,252 140,252" opacity=".5" />
          <polygon points="360,0 400,0 400,40 250,252 210,252" opacity=".9" />
        </g>
      )
      break
    case 'arcs':
      body = (
        <g fill="none" stroke={color} strokeWidth="1.3">
          {[70, 112, 156, 202, 250, 300].map(r => <circle key={r} cx="-10" cy="270" r={r} />)}
        </g>
      )
      break
    case 'grid':
      body = (
        <>
          <defs>
            <pattern id={`gr${uid}`} width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M26 0 L0 0 0 26" fill="none" stroke={color} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="400" height="252" fill={`url(#gr${uid})`} />
        </>
      )
      break
  }

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 252" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {body}
    </svg>
  )
}

/** Soft light reflection + fine grain, so flat colours feel like printed card stock. */
export function CardFinish({ metallic }: { metallic?: boolean }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(115deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,.08) 100%)' }}
      />
      {metallic && (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(105deg, transparent 22%, rgba(255,255,255,.20) 38%, transparent 52%, rgba(255,255,255,.06) 70%, transparent 82%)' }}
        />
      )}
      <svg className="absolute inset-0 w-full h-full opacity-[.07] mix-blend-overlay" aria-hidden>
        <filter id="cardgrain">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cardgrain)" />
      </svg>
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16), inset 0 1px 0 rgba(255,255,255,.28)' }} />
    </>
  )
}

export function Chip({ tone = 'gold', width = 40 }: { tone?: 'gold' | 'silver'; width?: number }) {
  const uid = useId().replace(/:/g, '')
  const [a, b, c] = tone === 'gold' ? ['#f6dd94', '#d1a24a', '#9a6f1f'] : ['#f3f4f6', '#b8bcc4', '#8a8f99']
  return (
    <svg width={width} height={width * 0.76} viewBox="0 0 40 30" aria-hidden>
      <defs>
        <linearGradient id={`ch${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset=".55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect x=".5" y=".5" width="39" height="29" rx="5.5" fill={`url(#ch${uid})`} stroke="rgba(0,0,0,.25)" />
      <g fill="none" stroke="rgba(0,0,0,.35)" strokeWidth=".9">
        <path d="M0 10 H13 Q16 10 16 13 V17 Q16 20 13 20 H0" />
        <path d="M40 10 H27 Q24 10 24 13 V17 Q24 20 27 20 H40" />
        <path d="M13 0 V10 M27 0 V10 M13 30 V20 M27 30 V20 M16 15 H24" />
      </g>
    </svg>
  )
}

export function Contactless({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M7 8.2c1.7 2.3 1.7 5.3 0 7.6" />
      <path d="M10.6 5.6c2.9 3.5 2.9 9.3 0 12.8" />
      <path d="M14.2 3c4 4.8 4 13.2 0 18" />
    </svg>
  )
}
