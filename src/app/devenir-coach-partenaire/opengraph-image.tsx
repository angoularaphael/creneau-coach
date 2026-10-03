import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Coacher dans les clubs Boxing Center : les conditions'

/** Vignette typographique, en attendant le visuel dédié (voir `og.tsx`). */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Coachs indépendants',
    titre: 'Coacher dans les clubs : diplôme, carte pro, assurance',
    detail: 'Compte gratuit · vos clients, vos tarifs · 0 % sur vos séances',
  })
}
