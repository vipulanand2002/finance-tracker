import Image from 'next/image'
import { formatCardDisplay, getCardTheme, getCobrandLogoUrl } from '@/lib/bank-logos'

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
  color: string
  logo_url: string | null
  pdf_password?: string | null
  cycle_start_day?: number | null
  statement_day?: number | null
}

export const CARD_GRADIENTS: Record<string, { from: string; to: string; text: string }> = {
  blue:   { from: '#1e3a8a', to: '#1d4ed8', text: '#ffffff' },
  gold:   { from: '#92400e', to: '#d97706', text: '#ffffff' },
  green:  { from: '#064e3b', to: '#059669', text: '#ffffff' },
  purple: { from: '#4c1d95', to: '#7c3aed', text: '#ffffff' },
  red:    { from: '#7f1d1d', to: '#dc2626', text: '#ffffff' },
  dark:   { from: '#111827', to: '#374151', text: '#ffffff' },
  rose:   { from: '#881337', to: '#e11d48', text: '#ffffff' },
  teal:   { from: '#134e4a', to: '#0d9488', text: '#ffffff' },
}

const NETWORK_LABEL: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  rupay: 'RuPay',
  amex: 'AMEX',
  other: '',
}

interface LogoProps { src: string; alt: string; size: number }
function BrandLogo({ src, alt, size }: LogoProps) {
  return (
    <div
      className="rounded-md overflow-hidden bg-white flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
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
}

export default function CardDisplay({ card, compact = false }: Props) {
  // Card name drives the theme; color preset is the fallback
  const theme = getCardTheme(card.card_name)
  const gradient = theme?.gradient ?? CARD_GRADIENTS[card.color] ?? CARD_GRADIENTS.blue
  const textColor = gradient.text ?? '#ffffff'

  const cobrandLogoUrl = theme?.cobrandDomain ? getCobrandLogoUrl(theme.cobrandDomain) : null
  const isCobrand = Boolean(cobrandLogoUrl)

  const expiry = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}`
    : null

  const bankLogoSize = compact ? 24 : 30
  const cobrandLogoSize = compact ? 28 : 36

  return (
    <div
      className={`relative rounded-2xl overflow-hidden select-none ${compact ? 'h-36' : 'h-48'}`}
      style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`, color: textColor }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-10 bg-white" />
      <div className="absolute -bottom-10 -left-6 w-44 h-44 rounded-full opacity-10 bg-white" />

      <div className={`relative h-full flex flex-col justify-between ${compact ? 'p-4' : 'p-5'}`}>

        {/* ── Top row ── */}
        <div className="flex items-start justify-between gap-2">

          {/* Left: co-brand logo (if cobrand) OR bank logo + name */}
          <div className="flex items-center gap-2 min-w-0">
            {isCobrand ? (
              <>
                <BrandLogo src={cobrandLogoUrl!} alt={theme!.cobrandName ?? ''} size={cobrandLogoSize} />
                {!compact && (
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-none opacity-90 truncate">{theme!.cobrandName}</p>
                    <p className="text-[10px] opacity-60 leading-none mt-0.5 capitalize">{card.card_type}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {card.logo_url && (
                  <BrandLogo src={card.logo_url} alt={card.bank_name} size={cobrandLogoSize} />
                )}
                <div className="min-w-0">
                  <p className={`font-bold leading-none truncate ${compact ? 'text-xs' : 'text-sm'}`}>{card.bank_name}</p>
                  <p className={`opacity-60 capitalize leading-none mt-0.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>{card.card_type}</p>
                </div>
              </>
            )}
          </div>

          {/* Right: bank logo (only shown on cobrand cards) OR chip */}
          <div className="flex items-center gap-2 shrink-0">
            {isCobrand && card.logo_url && (
              <BrandLogo src={card.logo_url} alt={card.bank_name} size={bankLogoSize} />
            )}
            {!compact && (
              <div className="w-9 h-7 rounded-md border-2 border-yellow-300/50 bg-yellow-200/20 grid grid-cols-2 gap-px p-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-yellow-300/50 rounded-sm" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Card number ── */}
        <div>
          <p className={`font-mono tracking-widest ${compact ? 'text-xs' : 'text-base'}`}>
            {formatCardDisplay(card.last_four)}
          </p>
        </div>

        {/* ── Bottom row: holder / expiry / network ── */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {card.holder_name && (
              <p className={`uppercase tracking-widest opacity-80 truncate ${compact ? 'text-[9px]' : 'text-xs'}`}>
                {card.holder_name}
              </p>
            )}
            {expiry && (
              <p className={`opacity-70 ${compact ? 'text-[9px]' : 'text-xs'}`}>
                <span className="opacity-60 mr-1">VALID THRU</span>{expiry}
              </p>
            )}
            {!card.holder_name && !expiry && (
              <p className={`opacity-60 truncate ${compact ? 'text-[9px]' : 'text-xs'}`}>{card.card_name}</p>
            )}
          </div>

          {/* Network logo */}
          {card.network !== 'other' && (
            <div className="shrink-0">
              {card.network === 'mastercard' ? (
                <div className="flex items-center">
                  <div className={`rounded-full bg-red-500 opacity-90 ${compact ? 'w-4 h-4' : 'w-6 h-6'}`} />
                  <div className={`rounded-full bg-yellow-400 opacity-90 -ml-2 ${compact ? 'w-4 h-4' : 'w-6 h-6'}`} />
                </div>
              ) : (
                <span className={`font-black italic ${compact ? 'text-xs' : 'text-sm'}`} style={{ fontFamily: 'serif' }}>
                  {NETWORK_LABEL[card.network]}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
