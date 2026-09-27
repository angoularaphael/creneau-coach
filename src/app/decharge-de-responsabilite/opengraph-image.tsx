import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Décharge de responsabilité — Boxing Center'

/** Sobre, comme la page : un document qui engage ne se vend pas. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Qui répond de quoi pendant la séance',
    titre: 'Décharge de responsabilité',
    fond: 'hero-decharge-de-responsabilite',
  })
}
