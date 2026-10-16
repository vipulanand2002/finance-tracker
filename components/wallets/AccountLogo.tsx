'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Wallet, Landmark, Banknote, CircleDollarSign, Gift } from 'lucide-react'
import { getProvider, providerLogoUrl, type AccountKind } from '@/lib/wallet-providers'
import { getCobrandLogoUrl } from '@/lib/bank-logos'

interface Props {
  /** Key from WALLET_PROVIDERS (older accounts) */
  provider?: string | null
  /** Domain identified for the account's brand / bank (preferred when present) */
  domain?: string | null
  kind?: AccountKind | null
  color?: string | null
  label?: string
  size?: number
}

// Brand logo for an account: the identified domain's logo, else a known provider's,
// else a coloured icon for the kind (bank / cash / wallet / other) — also used when
// the logo fails to load.
export default function AccountLogo({ provider, domain, kind, color, label, size = 32 }: Props) {
  const p = getProvider(provider)
  const url = domain ? getCobrandLogoUrl(domain) : providerLogoUrl(provider)
  // Reset the "failed" flag whenever the logo source changes (new domain typed)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (url && failedUrl !== url) {
    return (
      <span className="rounded-md overflow-hidden bg-white flex items-center justify-center shrink-0 border" style={{ width: size, height: size }}>
        <Image src={url} alt={label ?? p?.label ?? ''} width={size} height={size} className="object-contain" onError={() => setFailedUrl(url)} unoptimized />
      </span>
    )
  }

  const k = kind ?? p?.kind ?? 'other'
  const Icon = p?.key === 'gift_card' ? Gift : k === 'bank' ? Landmark : k === 'cash' ? Banknote : k === 'wallet' ? Wallet : CircleDollarSign
  const bg = color ?? p?.color ?? (k === 'bank' ? '#2563EB' : k === 'cash' ? '#16A34A' : '#64748B')
  return (
    <span className="rounded-md flex items-center justify-center shrink-0 text-white" style={{ width: size, height: size, backgroundColor: bg }}>
      <Icon style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  )
}
