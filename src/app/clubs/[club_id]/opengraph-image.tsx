import { vignetteOg, TAILLE_OG, TYPE_OG } from '@/lib/seo/og'
import { CLUB_PAGES, getClubBySlug, getClubByApiId } from '@/lib/seo'
import { ESPACES_PAR_CLUB, type ClubId } from '@/domain/contrat'
import type { NomDeFond } from '@/lib/seo/og'

/**
 * La photo de chaque club, écrite en toutes lettres.
 *
 * Elle a été générée À PARTIR d'une vraie photo de CETTE salle-là : la
 * charpente de Saint-Cyprien, le volume des Minimes, les baies de Ramonville.
 * Deux clubs ne doivent pas pouvoir se confondre sur une vignette.
 */
const FOND_PAR_CLUB: Record<string, NomDeFond> = {
  minimes: 'hero-club-toulouse-minimes',
  'st-cyprien': 'hero-club-toulouse-st-cyprien',
  'etats-unis': 'hero-club-toulouse-etats-unis',
  ramonville: 'hero-club-ramonville',
  portet: 'hero-club-portet-sur-garonne',
}

export const size = TAILLE_OG
export const contentType = TYPE_OG
export const alt = 'Club Boxing Center'

/**
 * Une vignette par club, pas une image de famille.
 *
 * Deux liens de clubs partagés côte à côte doivent être impossibles à confondre :
 * c'est la règle de la famille. Le nom du club et le nombre d'espaces suffisent
 * à les distinguer, et ce sont deux faits vérifiés — pas un slogan.
 */
export function generateStaticParams() {
  return CLUB_PAGES.map((c) => ({ club_id: c.slug }))
}

export default async function Image({ params }: { params: Promise<{ club_id: string }> }) {
  const { club_id } = await params
  const club = getClubBySlug(club_id) ?? getClubByApiId(club_id)

  const espaces = club
    ? (ESPACES_PAR_CLUB[club.clubId as ClubId] ?? [])
    : []
  const detail = espaces.length
    ? `${espaces.length} espace${espaces.length > 1 ? 's' : ''} · lun–sam 10 h → 19 h`
    : 'lun–sam 10 h → 19 h'

  return vignetteOg({
    surtitre: 'Club',
    titre: club ? club.nom : 'Boxing Center',
    detail,
    // Repli volontaire : un club sans photo dédiée sort quand même une vignette.
    fond: (club && FOND_PAR_CLUB[club.clubId]) || 'hero-clubs',
  })
}
