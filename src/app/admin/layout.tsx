import type { Metadata } from 'next'
import './admin.css'

import { Debordement } from '@/components/Debordement'

/**
 * Le back-office n'est jamais indexable. Trois couches, volontairement redondantes :
 *   1. ces métadonnées ;
 *   2. l'en-tête `X-Robots-Tag` posé sur `/admin/:path*` dans `next.config.ts` ;
 *   3. `app/robots.ts`, qui interdit le chemin.
 * Une seule couche suffirait — jusqu'au jour où quelqu'un en retire une.
 */
export const metadata: Metadata = {
  title: 'Back-office',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bo">
      {children}
      {/* Marque les bandes de filtres qui débordent vraiment, pour que le
          dégradé de défilement ne s'applique pas à celles qui tiennent. */}
      <Debordement selecteur=".bo__onglets" />
    </div>
  )
}
