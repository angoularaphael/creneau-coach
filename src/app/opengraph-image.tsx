import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Boxing Center — louer un créneau coach à Toulouse'

/** Vignette de l'accueil. Chaque autre page a la sienne. */
export default function Image() {
  return vignetteOg({
    surtitre: 'Créneaux coachs',
    titre: 'Louer une salle de boxe à Toulouse',
    detail: 'Cinq clubs · lundi à samedi, 10 h → 19 h · à partir de 10 €',
  })
}
