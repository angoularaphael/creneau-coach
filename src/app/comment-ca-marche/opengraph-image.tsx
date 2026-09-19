import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Comment réserver une salle chez Boxing Center'

/** Le déroulé complet. Le détail vient de la page, pas d'un slogan. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Le déroulé',
    titre: 'De la grille à la porte du club',
    detail: 'Choisir, payer, signer une fois, entrer avec son QR',
    fond: 'hero-comment-ca-marche',
  })
}
