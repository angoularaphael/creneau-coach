import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { TOTAL_RINGS } from '@/lib/seo/verite'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle de boxe à Toulouse'

export default async function Image() {
  return vignetteOg({
    surtitre: 'Salle de boxe',
    titre: `Louer une salle de boxe à Toulouse`,
    detail: `5 clubs · ${TOTAL_RINGS} rings · cage et octogone`,
    fond: 'espace-sacs',
  })
}
