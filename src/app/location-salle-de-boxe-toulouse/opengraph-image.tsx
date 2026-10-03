import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { TOTAL_RINGS } from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle de boxe à Toulouse : rings, cage et octogone à l’heure'

/**
 * Le titre était « Louer une salle de boxe à Toulouse » — mot pour mot celui de
 * la vignette de l'accueil. Deux liens partagés, deux pages, une seule image à
 * l'œil : c'est l'interdit n° 2 d'Eddy (vignettes jamais identiques d'une page
 * à l'autre). Celle-ci dit ce que la page seule apporte : l'équipement.
 */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Salle de boxe',
    titre: `${TOTAL_RINGS} rings, une cage, un octogone, à l’heure`,
    detail: `5 clubs à Toulouse · ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} ou ${prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure`,
    fond: 'espace-sacs',
  })
}
