import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Se connecter à son espace coach'

/** La page n'est pas indexée, mais un lien collé dans un message doit quand même s'afficher correctement. */
export default async function Image() {
  return vignetteOg({
    surtitre: 'Espace coach',
    titre: 'Connexion',
    detail: 'Vos réservations, vos avoirs, vos accès',
    fond: 'hero-connexion',
  })
}
