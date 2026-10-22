import { User, Lock, ListOrdered, Bell, Smartphone, type LucideIcon } from 'lucide-react'

export interface SettingsSection {
  key: string
  href: string
  title: string
  /** Short line shown on the Settings hub */
  description: string
  /** Longer line shown under the title once the section is open */
  pageDescription: string
  icon: LucideIcon
}

// Single source of truth for the Settings hub and the side menu. To add a new
// settings area: add an entry here and create app/(dashboard)/settings/<key>/page.tsx.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'profile',
    href: '/settings/profile',
    title: 'Profile',
    description: 'Your name, photo and who can see it',
    pageDescription: 'Your name and picture are shown in split reminders and emails.',
    icon: User,
  },
  {
    key: 'security',
    href: '/settings/security',
    title: 'Security',
    description: 'Password and sign-in',
    pageDescription: 'Keep your account safe with a strong password.',
    icon: Lock,
  },
  {
    key: 'navigation',
    href: '/settings/navigation',
    title: 'Navigation',
    description: 'Arrange the order of your sidebar menu',
    pageDescription: 'Put the pages you use most at the top of your menu.',
    icon: ListOrdered,
  },
  {
    key: 'notifications',
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Daily reminders to add transactions (Android app)',
    pageDescription: 'Choose how many reminders you get a day and at what times — set on your phone’s clock.',
    icon: Bell,
  },
  {
    key: 'home-screen',
    href: '/settings/home-screen',
    title: 'Home screen',
    description: 'Install the app and add quick-add shortcuts',
    pageDescription: 'Add Finance Tracker and one-tap shortcuts to your phone’s home screen.',
    icon: Smartphone,
  },
]
