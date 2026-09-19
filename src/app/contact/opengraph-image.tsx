import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Contacter Boxing Center'

/** Une porte d'entrée : le lien doit dire qu'on peut parler à quelqu'un. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Contact',
    titre: 'Nous écrire',
    detail: 'Cinq clubs autour de Toulouse',
    fond: 'hero-contact',
  })
}
