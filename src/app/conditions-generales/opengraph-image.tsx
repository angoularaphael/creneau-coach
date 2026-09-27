import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Conditions générales d’utilisation et de vente — Boxing Center'

/** Sobre, comme la page : un document qui engage ne se vend pas. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Louer une salle aux coachs, noir sur blanc',
    titre: 'Conditions générales d’utilisation et de vente',
    fond: 'hero-conditions-generales',
  })
}
