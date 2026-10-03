import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { DERNIERE_HEURE_DEBUT, PREMIERE_HEURE, REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Boxing Center — louer un créneau coach à Toulouse'

/**
 * Vignette de l'accueil. Chaque autre page a la sienne. Le prix et l'amplitude
 * sont lus dans le contrat : « à partir de 10 € » écrit à la main aurait
 * survécu au premier changement de tarif.
 */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Créneaux coachs',
    titre: 'Louer une salle de boxe à Toulouse',
    detail: `Cinq clubs · lundi à samedi, ${PREMIERE_HEURE} h → ${DERNIERE_HEURE_DEBUT + 1} h · à partir de ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)}`,
    fond: 'og-accueil',
  })
}
