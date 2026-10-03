import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = `Tarifs — ${creuse} en heure creuse, ${pleine} en heure pleine`

/**
 * Les prix sont LUS dans les réglages, comme sur la page : une vignette déjà
 * partagée qui afficherait l'ancien tarif contredirait la page qu'elle annonce.
 */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Tarifs',
    titre: `${creuse} l’heure creuse, ${pleine} l’heure pleine`,
    detail: `Annulée ${REGLAGES_DEFAUT.cancel_min_hours} h avant : un avoir du même montant`,
    fond: 'hero-tarifs',
  })
}
