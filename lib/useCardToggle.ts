'use client'

import { useState } from 'react'

const STORAGE_KEY = 'ft_include_cards'

export function useCardToggle(): [boolean, (v: boolean) => void] {
  const [includeCards, setIncludeCardsState] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved !== null ? saved === 'true' : true
  })

  function setIncludeCards(v: boolean) {
    setIncludeCardsState(v)
    localStorage.setItem(STORAGE_KEY, String(v))
  }

  return [includeCards, setIncludeCards]
}
