import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Règlement intérieur des clubs — Boxing Center'

/** Sobre, comme la page : un document qui engage ne se vend pas. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Les règles sur le tapis',
    titre: 'Règlement intérieur des clubs',
    fond: 'hero-reglement-interieur',
  })
}
