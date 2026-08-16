'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'ft_include_cards'

export function useCardToggle(): [boolean, (v: boolean) => void] {
  const [includeCards, setIncludeCardsState] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) setIncludeCardsState(saved === 'true')
  }, [])

  function setIncludeCards(v: boolean) {
    setIncludeCardsState(v)
    localStorage.setItem(STORAGE_KEY, String(v))
  }

  return [includeCards, setIncludeCards]
}
