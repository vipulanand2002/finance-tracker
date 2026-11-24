import Image from 'next/image'
import { formatCardDisplay, getCobrandLogoUrl } from '@/lib/bank-logos'
import { resolveLook, type CardDesign } from '@/lib/card-catalog'
import NetworkMark from './NetworkMark'
import { CardPattern, CardFinish, Chip, Contactless } from './CardArt'

export interface CardData {
  id: string
  card_name: string
  bank_name: string
  last_four: string
  card_type: 'credit' | 'debit' | 'prepaid'
  network: 'visa' | 'mastercard' | 'rupay' | 'amex' | 'other'
  expiry_month: number | null
  expiry_year: number | null
  holder_name: string | null
  /** 'auto', a design id, or 'img:<url>' — see lib/card-catalog.ts */
  color: string
  logo_url: string | null
  pdf_password?: string | null
  cycle_start_day?: number | null
  statement_day?: number | null
}

function BrandLogo({ src, alt, size }: { src: string; alt: string; size: number }) {
  return (
    <div className="rounded-md overflow-hidden bg-white/95 flex items-center justify-center shrink-0 shadow-sm" style={{ width: size, height: size }}>
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="object-contain"
        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
        unoptimized
      />
    </div>
  )
}

interface Props {
  card: CardData
  compact?: boolean
  /** Render a specific design instead of the card's own (used by the design picker) */
  designOverride?: CardDesign
  /** Artwork only (no text) — for small design thumbnails */
  thumb?: boolean
}

export default function CardDisplay({ card, compact = false, designOverride, thumb = false }: Props) {
  const look = resolveLook(card)
  const design = designOverride ?? look.design
  const image = designOverride ? null : look.image
  const cobrand = designOverride ? undefined : look.match?.cobrand
  const cobrandLogoUrl = cobrand ? getCobrandLogoUrl(cobrand.domain) : null

  const expiry = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}`
    : null
  const logoSize = compact ? 24 : 30

  const shell = 'relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden select-none shadow-[0_10px_30px_-10px_rgba(0,0,0,.55)]'

  if (thumb) {
    return (
      <div className={shell + ' shadow-none'} style={{ background: design.background, color: design.text }}>
        <CardPattern kind={design.pattern} color={design.patternColor} />
        <CardFinish metallic={design.metallic} />
        <div className="absolute left-[9%] top-[38%]"><Chip tone={design.chip} width={22} /></div>
      </div>
    )
  }

  // The user's own picture of the card: show it as the card face
  if (image) {
    return (
      <div className={shell} style={{ background: '#111' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={card.card_name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 38%)' }} />
        <div className="absolute inset-0 rounded-[inherit] pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }} />
        <div className="absolute left-3 bottom-3 right-3 flex items-end justify-between gap-2 text-white">
          <span className="text-[11px] font-medium truncate drop-shadow">{card.card_name}</span>
          <span className="font-mono text-xs tracking-widest drop-shadow shrink-0">•••• {card.last_four}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={shell} style={{ background: design.background, color: design.text }}>
      <CardPattern kind={design.pattern} color={design.patternColor} />
      <CardFinish metallic={design.metallic} />

      <div className={`relative h-full flex flex-col justify-between ${compact ? 'p-3.5' : 'p-5'}`}>
        {/* ── Top: who issued it ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {cobrandLogoUrl ? (
              <BrandLogo src={cobrandLogoUrl} alt={cobrand!.name} size={logoSize} />
            ) : card.logo_url ? (
              <BrandLogo src={card.logo_url} alt={card.bank_name} size={logoSize} />
            ) : null}
            <div className="min-w-0">
              <p className={`font-bold leading-tight truncate ${compact ? 'text-xs' : 'text-sm'}`}>{cobrand?.name ?? card.bank_name}</p>
              <p className={`leading-tight truncate ${compact ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: design.accent }}>
                {cobrand ? card.bank_name : card.card_name}
              </p>
            </div>
          </div>
          <span className={`uppercase font-semibold tracking-[.18em] shrink-0 ${compact ? 'text-[8px]' : 'text-[10px]'}`} style={{ color: design.accent }}>
            {card.card_type}
          </span>
        </div>

        {/* ── Middle: chip + contactless, then the number ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Chip tone={design.chip} width={compact ? 30 : 42} />
            <span className="opacity-80"><Contactless size={compact ? 16 : 22} /></span>
          </div>
          <p
            className={`font-mono tabular-nums ${compact ? 'text-xs tracking-[.14em]' : 'text-[17px] tracking-[.16em]'}`}
            style={{ textShadow: '0 1px 0 rgba(255,255,255,.22), 0 -1px 0 rgba(0,0,0,.35)' }}
          >
            {formatCardDisplay(card.last_four)}
          </p>
        </div>

        {/* ── Bottom: holder, expiry, network ── */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {card.holder_name ? (
              <p className={`uppercase tracking-[.14em] truncate font-medium ${compact ? 'text-[9px]' : 'text-xs'}`}>{card.holder_name}</p>
            ) : (
              <p className={`truncate opacity-70 ${compact ? 'text-[9px]' : 'text-xs'}`}>{card.card_name}</p>
            )}
            {expiry && (
              <p className={`opacity-80 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                <span className="opacity-70 mr-1 tracking-wider">VALID THRU</span>{expiry}
              </p>
            )}
          </div>
          {card.network !== 'other' && (
            <div className="shrink-0">
              <NetworkMark network={card.network} height={compact ? 18 : 26} color={design.text} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
