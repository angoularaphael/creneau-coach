import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Tarifs — 10 € en heure creuse, 15 € en heure pleine'

export default function Image() {
  return vignetteOg({
    surtitre: 'Tarifs',
    titre: '10 € l’heure creuse, 15 € l’heure pleine',
    detail: 'Prix par créneau d’une heure · paiement en une fois',
  })
}
