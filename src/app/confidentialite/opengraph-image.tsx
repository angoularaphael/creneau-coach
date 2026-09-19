import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Politique de confidentialité — Boxing Center'

/** Sobre, comme la page. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Vos données',
    titre: 'Confidentialité',
    fond: 'hero-confidentialite',
  })
}
