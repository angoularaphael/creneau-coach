import type { Metadata, Viewport } from 'next'
import './globals.css'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3041'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Boxing Center — location de créneaux pour coachs indépendants',
    template: '%s · Boxing Center',
  },
  description:
    "Réservez une heure dans un espace Boxing Center pour encadrer votre propre client. Cinq clubs, du lundi au samedi.",
  applicationName: 'Boxing Center Coachs',
  // Tant que le domaine de production n'est pas branché et vérifié, on n'ouvre pas
  // l'indexation. Publier un canonical qui pointe vers un domaine non servi est un
  // mensonge technique : docs/SEO-INFORMATION-ARCHITECTURE.md §8 et §14.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
