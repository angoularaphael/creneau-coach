import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Comment réserver une salle Boxing Center à l’heure, en quatre étapes'

/**
 * Le déroulé complet. « Signer une fois » a été retiré le 02/10/2026 : les
 * documents se signent après chaque paiement (CG art. 9). Le titre ne reprend
 * plus « De la grille à la porte du club », qui est un H2 de l'accueil.
 */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Le déroulé',
    titre: 'Réserver une salle à l’heure, en quatre étapes',
    detail: 'Choisir l’heure · payer · signer à l’écran · entrer avec son QR',
    fond: 'hero-comment-ca-marche',
  })
}
