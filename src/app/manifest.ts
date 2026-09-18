import type { MetadataRoute } from 'next'
import { SITE_NAME } from '@/lib/seo'

/**
 * Manifeste — nom court distinct de celui des sites clubs.
 *
 * Deux applications de la famille installées côte à côte sur un téléphone
 * doivent être impossibles à confondre : le nom court le dit, l'icône aussi.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — créneaux coachs`,
    short_name: 'Créneaux BC',
    description:
      'Réserver une heure dans un espace Boxing Center pour encadrer son propre client.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0d0f',
    theme_color: '#0c0d0f',
    lang: 'fr',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
