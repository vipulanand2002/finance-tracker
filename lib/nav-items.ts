import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  BrainCircuit,
  Users,
  CreditCard,
  Plane,
  MessageCircle,
  Settings,
  Scale,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

// Default navigation order. `href` is the stable key used when saving a
// user's custom order, so renaming a label never breaks saved preferences.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { label: 'Cards', href: '/cards', icon: CreditCard },
  { label: 'Trips', href: '/trips', icon: Plane },
  { label: 'Budgets', href: '/budgets', icon: Target },
  { label: 'Splits', href: '/splits', icon: Users },
  { label: 'Balances', href: '/balances', icon: Scale },
  { label: 'Friends', href: '/friends', icon: MessageCircle },
  { label: 'AI Assistant', href: '/ai', icon: BrainCircuit },
  { label: 'Settings', href: '/settings', icon: Settings },
]

// Apply a saved order (list of hrefs) to the default items. Unknown hrefs
// (removed pages) are dropped; pages added later that aren't in the saved
// order are appended at the end in their default order, so nothing ever
// disappears from the menu.
export function orderNavItems(saved?: string[] | null): NavItem[] {
  if (!saved?.length) return NAV_ITEMS
  const remaining = new Map(NAV_ITEMS.map(i => [i.href, i]))
  const out: NavItem[] = []
  for (const href of saved) {
    const item = remaining.get(href)
    if (item) { out.push(item); remaining.delete(href) }
  }
  for (const item of NAV_ITEMS) if (remaining.has(item.href)) out.push(item)
  return out
}

export const isDefaultNavOrder = (hrefs: string[]) =>
  hrefs.length === NAV_ITEMS.length && hrefs.every((h, i) => h === NAV_ITEMS[i].href)
