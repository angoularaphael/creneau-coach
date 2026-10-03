import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { REGLAGES_DEFAUT } from '@/domain/contrat'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Questions fréquentes des coachs — Boxing Center'

/**
 * Vignette typographique (sans `fond`) : aucune image n'a encore été générée
 * pour cette page, et une photo empruntée à une autre page ferait de cette
 * vignette le double d'une autre. Le détail cite trois règles chiffrées.
 */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Questions fréquentes',
    titre: 'Les règles pour réserver une salle, article par article',
    detail: `QR actif ${REGLAGES_DEFAUT.qr_early_minutes} min avant · annulation ${REGLAGES_DEFAUT.cancel_min_hours} h avant · un client par heure`,
  })
}
