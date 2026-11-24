import type { Network } from '@/lib/card-catalog'

interface Props {
  network: Network
  /** Height in px */
  height?: number
  /** Colour for wordmarks (Visa / RuPay) */
  color?: string
}

// Simplified network marks drawn as vectors, so they stay sharp at any size.
export default function NetworkMark({ network, height = 24, color = '#ffffff' }: Props) {
  if (network === 'visa') {
    return (
      <svg height={height} viewBox="0 0 74 26" role="img" aria-label="Visa">
        <text x="0" y="22" fontFamily="Arial, Helvetica, sans-serif" fontWeight={900} fontStyle="italic" fontSize="27" letterSpacing="-1.5" fill={color}>VISA</text>
      </svg>
    )
  }
  if (network === 'mastercard') {
    return (
      <svg height={height} viewBox="0 0 48 30" role="img" aria-label="Mastercard">
        <circle cx="18" cy="15" r="14" fill="#EB001B" />
        <circle cx="30" cy="15" r="14" fill="#F79E1B" />
        <path d="M24 3.4a14 14 0 0 1 0 23.2 14 14 0 0 1 0-23.2z" fill="#FF5F00" />
      </svg>
    )
  }
  if (network === 'rupay') {
    return (
      <svg height={height} viewBox="0 0 88 30" role="img" aria-label="RuPay">
        <text x="0" y="22" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontStyle="italic" fontSize="23" letterSpacing="-.5" fill={color}>RuPay</text>
        <polygon points="68,3 85,15 68,15" fill="#F37021" />
        <polygon points="68,15 85,15 68,27" fill="#138808" />
      </svg>
    )
  }
  if (network === 'amex') {
    return (
      <svg height={height} viewBox="0 0 46 30" role="img" aria-label="American Express">
        <rect width="46" height="30" rx="4" fill="#2E77BB" />
        <text x="23" y="20" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontSize="13" letterSpacing=".5" fill="#fff">AMEX</text>
      </svg>
    )
  }
  return null
}
