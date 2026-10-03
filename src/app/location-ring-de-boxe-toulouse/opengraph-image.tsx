import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { TOTAL_RINGS } from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de ring de boxe à Toulouse'

export default async function Image() {
  return vignetteOg({
    surtitre: 'Ring de boxe',
    titre: `${TOTAL_RINGS} rings à louer à l’heure`,
    detail: `Toulouse et agglomération · dès ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure`,
    fond: 'espace-ring',
  })
}
