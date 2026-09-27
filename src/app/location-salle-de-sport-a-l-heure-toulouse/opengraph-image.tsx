import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Location de salle de sport à l’heure à Toulouse'

export default async function Image() {
  return vignetteOg({
    surtitre: 'À l’heure',
    titre: 'Une salle de sport à l’heure, dès 10 €',
    detail: 'Heure creuse 10 € · heure pleine 15 € · 5 clubs',
    fond: 'section-duo',
  })
}
