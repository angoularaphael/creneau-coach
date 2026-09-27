import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle pour coach sportif à Toulouse'

export default async function Image() {
  return vignetteOg({
    surtitre: 'Coachs indépendants',
    titre: 'Louer une salle pour coacher à Toulouse',
    detail: '5 clubs · 10 € ou 15 € l’heure · sans abonnement',
    fond: 'section-coach',
  })
}
