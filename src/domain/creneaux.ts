/**
 * Génération et qualification de la grille de créneaux — LOT C.
 *
 * Neuf créneaux d'une heure par jour ouvré, du lundi au samedi, de 10:00 à 19:00
 * en heure murale Paris (CAHIER §3.3). Le dernier créneau COMMENCE à 18:00 : la
 * boucle va de 10 à 18 inclus, jamais jusqu'à 19, sans quoi on fabrique un
 * créneau fantôme 19:00→20:00 que personne ne surveille et que Brad affiche.
 *
 * Ce module est pur : aucun accès base, aucun `Date.now()`. `maintenant` est
 * toujours reçu en paramètre et vaut le `now()` de PostgreSQL (CAHIER §1.6).
 * En production, les instants de départ viennent de
 * `generate_series(…, interval '1 day', 'Europe/Paris')` ; ce module en est le
 * miroir exact, ce qui rend la tarification, le blocage et l'état testables sans base.
 */

// Extension `.ts` exigée par Node 22 (`--experimental-strip-types`), refusée par
// TypeScript tant que `allowImportingTsExtensions` n'est pas activé : le
// `@ts-expect-error` porte sur la ligne du spécificateur, et sur elle seule.
// Explication complète en tête de `horloge.ts`.
import {
  CLUB_EDUCATIVE_PARAMETRABLE,
  HEURES_CRENEAUX,
  HEURES_EDUCATIVE,
  JOURS_EDUCATIVE,
  REGLAGES_DEFAUT,
  STATUTS_ACTIFS,
  tarifDeLHeure,
  type ClubId,
  type Statut,
  type Tarif,
} from './contrat.ts'
import {
  instantDepuisParis,
  isoParis,
  joursCivils,
  partiesParis,
  analyserJourCivil,
} from './horloge.ts'

/** CAHIER §4 / openapi `SlotState`. L'ordre de précédence est fixé en §2.5. */
export type EtatCreneau = 'open' | 'full' | 'blocked' | 'past'

/**
 * LE prédicat d'occupation. Une seule définition pour trois consommateurs :
 * le `taken` de la grille, le compte d'actives d'un coach (ACTIVE_LIMIT) et
 * l'index unique partiel en base. Toute divergence entre les trois est un bug
 * de capacité — c'est-à-dire deux coachs sur un tatami prévu pour deux, plus un.
 */
export const STATUTS_OCCUPANTS = STATUTS_ACTIFS

export interface FaitsOccupation {
  statut: Statut
  /** Fin du hold de 10 minutes, en epoch ms. `null` dès que le hold est dépassé. */
  holdExpireMs: number | null
}

/**
 * Une réservation occupe un siège si elle est payée/signée en cours, OU si c'est
 * un hold encore vivant.
 *
 * Un hold périmé n'occupe RIEN, même si le cron n'est pas encore passé : c'est
 * ce qui rend le cron facultatif pour la correction. Compter les `held` au
 * statut seul enfermerait dehors un coach ayant trois holds morts, sans qu'aucun
 * écran ne puisse le lui expliquer.
 */
export function occupeUnSiege(r: FaitsOccupation, maintenant: number): boolean {
  if (r.statut === 'awaiting_signature' || r.statut === 'confirmed') return true
  if (r.statut === 'held') return r.holdExpireMs !== null && r.holdExpireMs > maintenant
  return false
}

// ---------------------------------------------------------------------------
// Blocages — deux formes, jamais une seule (spec §2.3)
// ---------------------------------------------------------------------------

/**
 * Règle récurrente, sans horizon : « mercredi 15 h, éducative ».
 * Miroir de `coach_slot_block_rules`. Pas de matérialisation, donc pas de cron
 * de remplissage, donc pas de jour où les enfants arrivent sur un tatami loué.
 */
export interface RegleBlocage {
  isodow: number
  heure: number
  /** `null` = tous les espaces du club. */
  espaceId: string | null
  actif: boolean
  raison?: string
}

/**
 * Exception datée, posée par `POST /admin/slot-blocks`.
 * Miroir de `coach_slot_blocks`. `genre: 'unblock'` couvre le « exceptionnellement,
 * ce mercredi, pas d'éducative » (spec §8-Q4) : l'exception datée l'emporte
 * TOUJOURS sur la règle récurrente, dans les deux sens.
 */
export interface BlocagePonctuel {
  debutMs: number
  espaceId: string
  genre: 'block' | 'unblock'
  raison?: string
}

export function estBloque(args: {
  isodow: number
  heure: number
  debutMs: number
  espaceId: string
  regles: readonly RegleBlocage[]
  blocages: readonly BlocagePonctuel[]
}): boolean {
  const ponctuel = args.blocages.find(
    (b) => b.debutMs === args.debutMs && b.espaceId === args.espaceId,
  )
  if (ponctuel) return ponctuel.genre === 'block'

  return args.regles.some(
    (r) =>
      r.actif &&
      r.isodow === args.isodow &&
      r.heure === args.heure &&
      (r.espaceId === null || r.espaceId === args.espaceId),
  )
}

/**
 * Jeu de règles par défaut d'un club, pour le SEED de la migration — pas une
 * décision d'exécution.
 *
 * À l'exécution, le code ne connaît pas Portet : il lit `coach_slot_block_rules`.
 * « Portet paramétrable » se réduit alors à `update … set active = …` sur quatre
 * lignes, depuis le back-office, sans déploiement. Le seul endroit où le slug
 * apparaît est ici, et il vient de `contrat.ts`, pas d'une chaîne écrite à la main.
 */
export function reglesEducativeParDefaut(
  clubId: ClubId,
  espaceId: string | null = null,
): RegleBlocage[] {
  const actif = clubId !== CLUB_EDUCATIVE_PARAMETRABLE
  const regles: RegleBlocage[] = []
  for (const isodow of JOURS_EDUCATIVE) {
    for (const heure of HEURES_EDUCATIVE) {
      regles.push({ isodow, heure, espaceId, actif, raison: 'educative' })
    }
  }
  return regles
}

// ---------------------------------------------------------------------------
// État d'un créneau
// ---------------------------------------------------------------------------

/**
 * L'ordre est contractuel, pas esthétique.
 *
 * 1. `past` d'abord : un créneau derrière nous est gris, et « boxe éducative »
 *    n'a aucun sens sur un mercredi de la semaine dernière.
 * 2. `blocked` ensuite : l'interdiction prime sur la capacité.
 * 3. `full` enfin, avec `>=` et non `>` : si la direction abaisse la capacité de
 *    2 à 1 alors que deux holds vivent, le créneau se referme sans annuler
 *    personne rétroactivement.
 *
 * `past` se décide sur `debutMs <= maintenant` (spec §8-Q3) : on ne réserve pas
 * une séance commencée.
 */
export function etatDuCreneau(args: {
  debutMs: number
  maintenant: number
  bloque: boolean
  pris: number
  capacite: number
}): EtatCreneau {
  if (args.debutMs <= args.maintenant) return 'past'
  if (args.bloque) return 'blocked'
  if (args.pris >= args.capacite) return 'full'
  return 'open'
}

/**
 * Le créneau demandé appartient-il seulement à la grille ?
 * Rend `null` si tout va bien, sinon le code d'erreur du CAHIER §1.3.
 *
 * Miroir TS des gardes de `coach_hold_slot()` : lundi–samedi, 10..18, pile à
 * l'heure, dans le futur. L'heure et le jour sont lus en HEURE DE PARIS, jamais
 * par `EXTRACT(HOUR FROM starts_at)` sur un timestamptz en session UTC, qui
 * rendrait 8 ou 9 pour un créneau de 10 h.
 */
export function verifierCreneauReservable(args: {
  debutMs: number
  maintenant: number
}): 'VALIDATION_ERROR' | null {
  const p = partiesParis(args.debutMs)
  if (args.debutMs <= args.maintenant) return 'VALIDATION_ERROR'
  if (p.minute !== 0 || p.seconde !== 0 || args.debutMs % 1000 !== 0) return 'VALIDATION_ERROR'
  if (p.isodow < 1 || p.isodow > 6) return 'VALIDATION_ERROR'
  if (!(HEURES_CRENEAUX as readonly number[]).includes(p.heure)) return 'VALIDATION_ERROR'
  return null
}

// ---------------------------------------------------------------------------
// Grille
// ---------------------------------------------------------------------------

export interface TarifsCentimes {
  offpeak: number
  peak: number
}

/**
 * Une réservation, vue par la grille. Le champ `coachId` sert UNIQUEMENT à
 * calculer `mine` ; il ne sort jamais du moteur.
 *
 * L'appelant est censé avoir déjà restreint la requête à (club, espace) —
 * toute clé de ce lot porte `(club_id, space_id, starts_at)`, jamais
 * `(space_id, starts_at)` : « salle » existe à Minimes, Saint-Cyprien ET
 * Ramonville, et partager deux sièges entre trois clubs serait invisible et
 * incompréhensible. `clubId`/`espaceId` restent optionnels ici et, s'ils sont
 * fournis, sont refiltrés : une ceinture contre un appelant distrait.
 */
export interface ReservationDuCreneau extends FaitsOccupation {
  debutMs: number
  coachId: string
  clubId?: string
  espaceId?: string
}

/** Vue interne, riche. Ne traverse JAMAIS la frontière HTTP telle quelle. */
export interface CreneauInterne {
  debutMs: number
  finMs: number
  debutIso: string
  finIso: string
  heureParis: number
  isodow: number
  jourParis: string
  tarif: Tarif
  montantCents: number
  capacite: number
  pris: number
  etat: EtatCreneau
  /** Interne. Le payload public ne l'accepte pas — TypeScript refuse la fuite. */
  coachsOccupants: readonly string[]
}

/** Exactement `components.schemas.Slot` de `docs/openapi.yaml`. */
export interface CreneauPublic {
  starts_at: string
  ends_at: string
  amount_cents: number
  tariff: Tarif
  capacity: number
  taken: number
  state: EtatCreneau
  /** Présent UNIQUEMENT pour une session coach. */
  mine?: boolean
}

/** Les sept clés obligatoires, dans l'ordre de l'OpenAPI. Verrouillées par un test. */
export const CLES_CRENEAU_PUBLIC = [
  'starts_at',
  'ends_at',
  'amount_cents',
  'tariff',
  'capacity',
  'taken',
  'state',
] as const

export type Spectateur = { genre: 'coach'; id: string } | { genre: 'anonyme' }

/**
 * Le payload public — liste blanche, construction littérale, champ par champ.
 *
 * `return { ...ligne, state }` est INTERDIT dans tout le lot C. Le mécanisme qui
 * garantit qu'aucun nom de coach ne fuite (CAHIER §4) n'est pas « penser à ne pas
 * le mettre » : c'est « ne jamais construire l'objet à partir d'une ligne de base ».
 * `taken` est un entier : il dit qu'un siège est pris, jamais par qui.
 */
export function versCreneauPublic(
  creneau: CreneauInterne,
  spectateur: Spectateur | null,
): CreneauPublic {
  const sortie: CreneauPublic = {
    starts_at: creneau.debutIso,
    ends_at: creneau.finIso,
    amount_cents: creneau.montantCents,
    tariff: creneau.tarif,
    capacity: creneau.capacite,
    taken: creneau.pris,
    state: creneau.etat,
  }
  if (spectateur?.genre === 'coach') {
    sortie.mine = creneau.coachsOccupants.includes(spectateur.id)
  }
  return sortie
}

export interface OptionsGrille {
  /** Premier jour Paris, inclus, 'YYYY-MM-DD'. */
  du: string
  /** Dernier jour Paris, inclus. */
  au: string
  /** `now()` de PostgreSQL, en epoch ms. */
  maintenant: number
  espaceId: string
  clubId?: string
  capacite?: number
  tarifs?: TarifsCentimes
  regles?: readonly RegleBlocage[]
  blocages?: readonly BlocagePonctuel[]
  reservations?: readonly ReservationDuCreneau[]
}

const TARIFS_DEFAUT: TarifsCentimes = {
  offpeak: REGLAGES_DEFAUT.offpeak_cents,
  peak: REGLAGES_DEFAUT.peak_cents,
}

/**
 * Construit la grille d'un espace sur un intervalle de jours Paris.
 *
 * Le dimanche (isodow 7) ne produit aucun créneau : il n'est pas « bloqué », il
 * n'existe pas. Les deux bascules d'heure tombent un dimanche, à 02:00/03:00,
 * donc hors de la plage 10:00–19:00 — aucun créneau réservable ne tombera jamais
 * dans le trou de printemps ni dans l'heure doublée d'automne. Ce qui reste
 * dangereux, et que cette fonction évite, c'est d'avancer de 86 400 000 ms d'un
 * créneau au suivant : on itère sur le CALENDRIER (`joursCivils`) puis on convertit
 * chaque heure murale en instant.
 */
export function construireGrille(options: OptionsGrille): CreneauInterne[] {
  if (!analyserJourCivil(options.du) || !analyserJourCivil(options.au)) {
    throw new Error(`creneaux: intervalle invalide (${options.du} → ${options.au})`)
  }
  const capacite = options.capacite ?? REGLAGES_DEFAUT.capacity_per_slot
  const tarifs = options.tarifs ?? TARIFS_DEFAUT
  const regles = options.regles ?? []
  const blocages = options.blocages ?? []

  const pertinentes = (options.reservations ?? []).filter(
    (r) =>
      (r.espaceId === undefined || r.espaceId === options.espaceId) &&
      (r.clubId === undefined || options.clubId === undefined || r.clubId === options.clubId),
  )

  // Un seul passage sur les réservations : le prédicat d'occupation est appliqué
  // ici et nulle part ailleurs dans ce module.
  const occupantsParInstant = new Map<number, string[]>()
  for (const r of pertinentes) {
    if (!occupeUnSiege(r, options.maintenant)) continue
    const deja = occupantsParInstant.get(r.debutMs)
    if (deja) deja.push(r.coachId)
    else occupantsParInstant.set(r.debutMs, [r.coachId])
  }

  const grille: CreneauInterne[] = []
  for (const ymd of joursCivils(options.du, options.au)) {
    const civil = analyserJourCivil(ymd)
    if (!civil) continue
    for (const heure of HEURES_CRENEAUX) {
      const debut = instantDepuisParis(civil.annee, civil.mois, civil.jour, heure)
      // Impossible dans la plage 10..18 (les bascules sont à 02:00/03:00), mais on
      // ne fabrique jamais un instant à partir d'une heure qui n'existe pas.
      if (debut.genre === 'inexistant') continue
      const debutMs = debut.ms
      const p = partiesParis(debutMs)
      if (p.isodow === 7) continue

      const finMs = debutMs + 3_600_000
      const tarif = tarifDeLHeure(heure)
      const occupants = occupantsParInstant.get(debutMs) ?? []
      const bloque = estBloque({
        isodow: p.isodow,
        heure,
        debutMs,
        espaceId: options.espaceId,
        regles,
        blocages,
      })

      grille.push({
        debutMs,
        finMs,
        debutIso: isoParis(debutMs),
        finIso: isoParis(finMs),
        heureParis: heure,
        isodow: p.isodow,
        jourParis: p.ymd,
        tarif,
        montantCents: tarif === 'peak' ? tarifs.peak : tarifs.offpeak,
        capacite,
        pris: occupants.length,
        etat: etatDuCreneau({
          debutMs,
          maintenant: options.maintenant,
          bloque,
          pris: occupants.length,
          capacite,
        }),
        coachsOccupants: occupants,
      })
    }
  }
  return grille
}

/** Grille publique prête à sérialiser. Le seul chemin vers une réponse HTTP. */
export function grillePublique(
  options: OptionsGrille,
  spectateur: Spectateur | null,
): CreneauPublic[] {
  return construireGrille(options).map((c) => versCreneauPublic(c, spectateur))
}
