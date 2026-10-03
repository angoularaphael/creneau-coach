import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle pour coach sportif à Toulouse'

export default async function Image() {
  return vignetteOg({
    surtitre: 'Coachs indépendants',
    titre: 'Louer une salle pour coacher à Toulouse',
    detail: `5 clubs · ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} ou ${prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure · sans abonnement`,
    fond: 'section-coach',
  })
}
