import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Créer son compte coach Boxing Center'

/** Le lien le plus partagé de tous : un coach qui en recommande un autre. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Inscription',
    titre: 'Créez votre compte coach',
    detail: 'Gratuit · une minute · sans engagement',
    fond: 'hero-inscription',
  })
}
