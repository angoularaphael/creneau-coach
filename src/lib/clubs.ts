import {
  ESPACES_PAR_CLUB,
  HEURES_CREUSES,
  HEURES_PLEINES,
  estClubId,
  type ClubId,
} from '@/domain/contrat'
import type { ClubDetail } from '@/lib/api/types'
import { CLUBS_VERITE } from '@/lib/seo/verite'

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

/** Le visuel de CE club, fait à partir d'une vraie photo de sa salle. */
const VISUELS: Record<ClubId, string> = {
  minimes: '/visuels/hero-club-toulouse-minimes.webp',
  'st-cyprien': '/visuels/hero-club-toulouse-st-cyprien.webp',
  'etats-unis': '/visuels/hero-club-toulouse-etats-unis.webp',
  ramonville: '/visuels/hero-club-ramonville.webp',
  portet: '/visuels/hero-club-portet-sur-garonne.webp',
}

/** « 10h–12h · 14h–17h » à partir des heures de début, regroupées en plages. */
function plages(heures: readonly number[]): string {
  const blocs: [number, number][] = []
  for (const h of [...heures].sort((a, b) => a - b)) {
    const dernier = blocs.at(-1)
    if (dernier && dernier[1] === h) dernier[1] = h + 1
    else blocs.push([h, h + 1])
  }
  return blocs.map(([a, b]) => `${a}h–${b}h`).join(' · ')
}

/**
 * Ce que la base ne porte pas encore (description, accès), PROJETÉ DU REGISTRE
 * DE VÉRITÉ — jamais écrit à la main.
 *
 * Jusqu'au 27/09/2026 ce bloc était rédigé ici, sans source, et il était faux :
 * « Métro A — Minimes » (les Minimes sont sur la ligne B), « Métro B — Empalot /
 * Rangueil » pour l'avenue des États-Unis (deux stations du sud de Toulouse,
 * pour un club au nord), « Douches », « Parking », « Accès A64 » que rien ne
 * confirmait, et « Blocages éducative paramétrables en BO » en guise de
 * description publique. L'API publique `/api/v1/clubs` le servait tel quel à
 * qui l'interrogeait — agents compris.
 *
 * Règle : un fait qui n'est pas dans `src/lib/seo/verite.ts` n'est pas publié.
 * `amenities` reste vide tant que la base ne la remplit pas ; l'équipement
 * vérifié est dans `description`, cité depuis la page officielle du club.
 */
type CopieClub = Pick<
  ClubDetail,
  'city' | 'hero_image' | 'description' | 'amenities' | 'transport' | 'peak_hours' | 'offpeak_hours'
>

function copie(id: ClubId): CopieClub {
  const v = CLUBS_VERITE[id]
  const equipement = v.equipement.resume
  return {
    city: v.ville,
    hero_image: VISUELS[id],
    description: `${equipement.charAt(0).toUpperCase()}${equipement.slice(1)}, à louer à l’heure pour vos séances de coaching.`,
    amenities: [],
    transport: v.acces?.texte,
    peak_hours: plages(HEURES_PLEINES),
    offpeak_hours: plages(HEURES_CREUSES),
  }
}

export const COPY_CLUBS: Record<ClubId, CopieClub> = {
  minimes: copie('minimes'),
  'st-cyprien': copie('st-cyprien'),
  'etats-unis': copie('etats-unis'),
  ramonville: copie('ramonville'),
  portet: copie('portet'),
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
