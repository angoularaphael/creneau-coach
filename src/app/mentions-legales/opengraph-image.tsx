import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Mentions légales — Boxing Center'

/** Sobre, comme la page. Une vignette légale ne vend rien. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Informations légales',
    titre: 'Mentions légales',
    fond: 'hero-mentions-legales',
  })
}
