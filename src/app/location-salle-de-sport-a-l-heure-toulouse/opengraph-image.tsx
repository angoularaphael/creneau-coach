import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

const C = REGLAGES_DEFAUT.offpeak_cents
const P = REGLAGES_DEFAUT.peak_cents

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle de sport à l’heure à Toulouse'

/** Les montants sont calculés depuis les réglages, comme sur la page. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'À l’heure',
    titre: `Une salle de sport à l’heure, dès ${prixCourt(C)}`,
    detail: `3 séances creuses par semaine : ${prixCourt(3 * C)} · heure pleine ${prixCourt(P)}`,
    fond: 'section-duo',
  })
}
