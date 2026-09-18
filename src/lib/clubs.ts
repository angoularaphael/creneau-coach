import type { ClubDetail, ClubId, ClubSummary } from '@/lib/api/types';

/** Seed contrat §3.2 — slugs boutique, espaces figés. */
export const CLUBS: ClubDetail[] = [
  {
    id: 'minimes',
    name: 'Boxing Center Minimes',
    city: 'Toulouse',
    hero_image: '/clubs/minimes.jpg',
    spaces: [{ id: 'salle', name: 'Salle', capacity: 2 }],
    description:
      'Salle historique au cœur des Minimes. Ring, sacs et espace coaching individuel.',
    amenities: ['Ring', 'Sacs lourds', 'Vestiaires', 'Douches'],
    transport: 'Métro A — Minimes – Claude Nougaro',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  {
    id: 'st-cyprien',
    name: 'Boxing Center Saint-Cyprien',
    city: 'Toulouse',
    hero_image: '/clubs/st-cyprien.jpg',
    spaces: [{ id: 'salle', name: 'Salle', capacity: 2 }],
    description:
      'Club rive gauche : coaching privé dans une salle lumineuse et équipée.',
    amenities: ['Sacs', 'Tapis', 'Vestiaires'],
    transport: 'Métro A — Saint-Cyprien – République',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  {
    id: 'etats-unis',
    name: 'Boxing Center États-Unis',
    city: 'Toulouse',
    hero_image: '/clubs/etats-unis.jpg',
    spaces: [
      { id: 'boxe', name: 'Boxe', capacity: 2 },
      { id: 'mma-sol', name: 'MMA / Sol', capacity: 2 },
      { id: 'fitness', name: 'Fitness', capacity: 2 },
    ],
    description:
      'Trois espaces distincts — Boxe, MMA-Sol et Fitness — pour réserver le bon terrain.',
    amenities: ['Ring', 'Cage / sol', 'Zone fitness', 'Vestiaires'],
    transport: 'Métro B — Empalot / Rangueil selon accès',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  {
    id: 'ramonville',
    name: 'Boxing Center Ramonville',
    city: 'Ramonville-Saint-Agne',
    hero_image: '/clubs/ramonville.jpg',
    spaces: [{ id: 'salle', name: 'Salle', capacity: 2 }],
    description:
      'Salle sud-est : créneaux coachs sur grille lun–sam 10h–19h.',
    amenities: ['Sacs', 'Ring', 'Parking'],
    transport: 'Ligne de bus / parking sur place',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
  {
    id: 'portet',
    name: 'Boxing Center Portet',
    city: 'Portet-sur-Garonne',
    hero_image: '/clubs/portet.jpg',
    spaces: [
      { id: 'boxe-fitness', name: 'Boxe / Fitness', capacity: 2 },
      { id: 'mma-sol', name: 'MMA / Sol', capacity: 2 },
    ],
    description:
      'Deux espaces (Boxe-Fitness et MMA-Sol). Blocages éducative paramétrables en BO.',
    amenities: ['Sacs', 'Sol MMA', 'Parking'],
    transport: 'Accès A64 / parking club',
    peak_hours: '12h–14h · 17h–19h',
    offpeak_hours: '10h–12h · 14h–17h',
  },
];

export function listClubs(): ClubSummary[] {
  return CLUBS.map(({ id, name, city, hero_image, spaces }) => ({
    id,
    name,
    city,
    hero_image,
    spaces,
  }));
}

export function getClub(clubId: string): ClubDetail | null {
  return CLUBS.find((c) => c.id === clubId) ?? null;
}

export function isClubId(value: string): value is ClubId {
  return CLUBS.some((c) => c.id === value);
}
