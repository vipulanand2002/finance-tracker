'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Wallet, Landmark, Banknote, CircleDollarSign, Gift } from 'lucide-react'
import { getProvider, providerLogoUrl } from '@/lib/wallet-providers'

// Brand logo for a wallet provider, or a coloured icon for generic kinds
// (bank / cash / gift card / other) and when the logo fails to load.
export default function AccountLogo({ provider, size = 32 }: { provider: string | null | undefined; size?: number }) {
  const [failed, setFailed] = useState(false)
  const p = getProvider(provider)
  const url = providerLogoUrl(provider)

  if (url && !failed) {
    return (
      <span className="rounded-md overflow-hidden bg-white flex items-center justify-center shrink-0 border" style={{ width: size, height: size }}>
        <Image src={url} alt={p?.label ?? ''} width={size} height={size} className="object-contain" onError={() => setFailed(true)} unoptimized />
      </span>
    )
  }

  const Icon = p?.key === 'gift_card' ? Gift
    : p?.kind === 'bank' ? Landmark
    : p?.kind === 'cash' ? Banknote
    : p?.kind === 'wallet' ? Wallet
    : CircleDollarSign
  return (
    <span
      className="rounded-md flex items-center justify-center shrink-0 text-white"
      style={{ width: size, height: size, backgroundColor: p?.color ?? '#64748B' }}
    >
      <Icon style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  )
}
