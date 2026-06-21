import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finance Tracker',
    short_name: 'Finance',
    description: 'Track expenses, splits, and trips with AI insights',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    orientation: 'portrait-primary',
    lang: 'en',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Transactions', url: '/transactions', description: 'Add a new transaction' },
      { name: 'Trips',        url: '/trips',         description: 'View your trips' },
      { name: 'Splits',       url: '/splits',        description: 'View your splits' },
    ],
    categories: ['finance', 'productivity'],
  }
}
