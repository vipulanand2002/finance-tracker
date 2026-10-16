'use client'

import { useEffect, useState } from 'react'

// Accounts whose income/expenses are switched OFF for monthly totals, charts and
// budgets (accounts.include_in_spending = false). Empty until loaded / if the
// wallets feature or migration 048 isn't set up, so nothing is excluded by default.
export function useExcludedFromSpending(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then((d: { accounts?: { id: string; include_in_spending?: boolean }[] }) =>
        setIds(new Set((d.accounts ?? []).filter(a => a.include_in_spending === false).map(a => a.id))))
      .catch(() => {})
  }, [])
  return ids
}
