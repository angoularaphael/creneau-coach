import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Les cinq clubs Boxing Center autour de Toulouse'

export default function Image() {
  return vignetteOg({
    surtitre: 'Nos clubs',
    titre: 'Cinq salles autour de Toulouse',
    detail: 'Minimes · Saint-Cyprien · États-Unis · Ramonville · Portet',
  })
}
