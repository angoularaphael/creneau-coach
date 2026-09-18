import { ESPACES_PAR_CLUB, estClubId, type ClubId } from '@/domain/contrat'
import type { ClubDetail } from '@/lib/api/types'

export { estClubId as isClubId }
export type { ClubId }

const NOMS: Record<ClubId, string> = {
  minimes: 'Boxing Center Minimes',
  'st-cyprien': 'Boxing Center Saint-Cyprien',
  'etats-unis': 'Boxing Center États-Unis',
  ramonville: 'Boxing Center Ramonville',
  portet: 'Boxing Center Portet',
}

export function nomClub(id: string): string {
  return estClubId(id) ? NOMS[id] : id
}

/** Copie marketing si la base n'a pas encore description / transport. */
export const COPY_CLUBS: Record<
  ClubId,
  Pick<ClubDetail, 'city' | 'hero_image' | 'description' | 'amenities' | 'transport' | 'peak_hours' | 'offpeak_hours'>
> = {
  minimes: {
    city: 'Toulouse',
    hero_image: '/clubs/minimes.jpg',
    description:
      'Salle historique au cœur des Minimes. Ring, sacs et espace coaching individuel.',
    amenities: ['Ring', 'Sacs lourds', 'Vestiaires', 'Douches'],
    transport: 'Métro A — Minimes – Claude Nougaro',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  'st-cyprien': {
    city: 'Toulouse',
    hero_image: '/clubs/st-cyprien.jpg',
    description:
      'Club rive gauche : coaching privé dans une salle lumineuse et équipée.',
    amenities: ['Sacs', 'Tapis', 'Vestiaires'],
    transport: 'Métro A — Saint-Cyprien – République',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  'etats-unis': {
    city: 'Toulouse',
    hero_image: '/clubs/etats-unis.jpg',
    description:
      'Trois espaces distincts — Boxe, MMA-Sol et Fitness — pour réserver le bon terrain.',
    amenities: ['Ring', 'Cage / sol', 'Zone fitness', 'Vestiaires'],
    transport: 'Métro B — Empalot / Rangueil selon accès',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  ramonville: {
    city: 'Ramonville-Saint-Agne',
    hero_image: '/clubs/ramonville.jpg',
    description: 'Salle sud-est : créneaux coachs sur grille lun–sam 10h–19h.',
    amenities: ['Sacs', 'Ring', 'Parking'],
    transport: 'Ligne de bus / parking sur place',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  portet: {
    city: 'Portet-sur-Garonne',
    hero_image: '/clubs/portet.jpg',
    description:
      'Deux espaces (Boxe-Fitness et MMA-Sol). Blocages éducative paramétrables en BO.',
    amenities: ['Sacs', 'Sol MMA', 'Parking'],
    transport: 'Accès A64 / parking club',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
}

/** Noms / copy locale — la source de vérité des espaces et de la grille est la base. */
export function getClub(clubId: string): ClubDetail | null {
  if (!estClubId(clubId)) return null
  const copy = COPY_CLUBS[clubId]
  return {
    id: clubId,
    name: NOMS[clubId],
    ...copy,
    spaces: ESPACES_PAR_CLUB[clubId].map((id) => ({ id, name: id, capacity: 2 })),
  }
}
