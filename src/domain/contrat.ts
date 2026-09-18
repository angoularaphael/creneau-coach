/**
 * Le contrat, et rien d'autre.
 *
 * Tout ce qui est ici vient de `docs/CAHIER-API.md` et de `docs/openapi.yaml`.
 * Aucune valeur n'est inventée. Si une valeur manque ici, elle n'existe pas dans le
 * contrat, et il faut passer par une PR relue par le responsable du lot concerné —
 * pas par une constante ajoutée à la va-vite.
 *
 * Référence : CAHIER-API.md §1.4 (identifiants et argent), §2 (machine à états),
 * §3.2 (clubs et espaces), §3.3 (créneaux types), §3.4 (tarifs), §3.9 (réglages).
 */

// ---------------------------------------------------------------------------
// Clubs et espaces — CAHIER §3.2. Les identifiants sont les slugs de la boutique.
// ---------------------------------------------------------------------------

export const CLUB_IDS = ['minimes', 'st-cyprien', 'etats-unis', 'ramonville', 'portet'] as const
export type ClubId = (typeof CLUB_IDS)[number]

export const ESPACES_PAR_CLUB = {
  'minimes': ['salle'],
  'st-cyprien': ['salle'],
  'ramonville': ['salle'],
  'etats-unis': ['boxe', 'mma-sol', 'fitness'],
  'portet': ['boxe-fitness', 'mma-sol'],
} as const satisfies Record<ClubId, readonly string[]>

export function estClubId(valeur: unknown): valeur is ClubId {
  return typeof valeur === 'string' && (CLUB_IDS as readonly string[]).includes(valeur)
}

export function estEspaceDuClub(clubId: ClubId, espaceId: string): boolean {
  return (ESPACES_PAR_CLUB[clubId] as readonly string[]).includes(espaceId)
}

// ---------------------------------------------------------------------------
// Machine à états — CAHIER §2.
// ---------------------------------------------------------------------------

export const STATUTS = [
  'held',
  'awaiting_signature',
  'confirmed',
  'consumed',
  'expired',
  'payment_failed',
  'cancelled_credit',
  'no_show',
] as const
export type Statut = (typeof STATUTS)[number]

/** Les trois statuts qui comptent dans la limite de réservations actives (§2). */
export const STATUTS_ACTIFS = ['held', 'awaiting_signature', 'confirmed'] as const
export type StatutActif = (typeof STATUTS_ACTIFS)[number]

export function estActif(statut: Statut): statut is StatutActif {
  return (STATUTS_ACTIFS as readonly string[]).includes(statut)
}

export const STATUTS_PAIEMENT = ['unpaid', 'paid', 'failed', 'waived_credit'] as const
export type StatutPaiement = (typeof STATUTS_PAIEMENT)[number]

export const STATUTS_SIGNATURE = ['none', 'signed'] as const
export type StatutSignature = (typeof STATUTS_SIGNATURE)[number]

// ---------------------------------------------------------------------------
// Rôles — CAHIER §1.1. Lus depuis `app_metadata.role` du JWT Supabase.
// ---------------------------------------------------------------------------

export const ROLES = ['coach', 'manager_salle', 'direction', 'service'] as const
export type Role = (typeof ROLES)[number]

// ---------------------------------------------------------------------------
// Codes d'erreur — CAHIER §1.3. Le code ET le statut HTTP sont contractuels :
// changer l'un des deux est un changement cassant qui impose une v2 (§14).
// ---------------------------------------------------------------------------

export const CODES_ERREUR = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  WEBHOOK_INVALID: 401,
  FORBIDDEN: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  SLOT_FULL: 409,
  SLOT_BLOCKED: 409,
  ACTIVE_LIMIT: 409,
  HOLD_EXPIRED: 409,
  PAYMENT_REQUIRED: 409,
  SIGNATURE_REQUIRED: 409,
  CANCEL_TOO_LATE: 409,
  PRICE_MISMATCH: 409,
  CONFLICT: 409,
  QR_WINDOW_CLOSED: 410,
  QR_WRONG_CLUB: 422,
  RATE_LIMITED: 429,
} as const satisfies Record<string, number>

export type CodeErreur = keyof typeof CODES_ERREUR

/** Message par défaut, en français, montrable à un coach. Jamais de détail technique. */
export const MESSAGES_ERREUR: Record<CodeErreur, string> = {
  VALIDATION_ERROR: 'Requête invalide.',
  UNAUTHENTICATED: 'Connectez-vous pour continuer.',
  WEBHOOK_INVALID: 'Signature invalide.',
  FORBIDDEN: 'Action non autorisée.',
  SUSPENDED: 'Votre compte est suspendu. Contactez Boxing Center.',
  NOT_FOUND: 'Introuvable.',
  SLOT_FULL: 'Ce créneau est complet (2 coachs).',
  SLOT_BLOCKED: 'Ce créneau est réservé à la boxe éducative.',
  ACTIVE_LIMIT: 'Vous avez déjà 3 réservations en cours.',
  HOLD_EXPIRED: 'Le délai de 10 minutes est écoulé, le créneau a été libéré.',
  PAYMENT_REQUIRED: 'Le paiement doit être réglé avant cette étape.',
  SIGNATURE_REQUIRED: 'Les documents doivent être signés avant cette étape.',
  CANCEL_TOO_LATE: "L'annulation n'est plus possible à moins de 24 heures du créneau.",
  PRICE_MISMATCH: 'Le montant ne correspond pas à la réservation.',
  CONFLICT: "Cette action n'est pas possible dans l'état actuel de la réservation.",
  QR_WINDOW_CLOSED: "Ce QR n'est pas valide en dehors de son créneau.",
  QR_WRONG_CLUB: "Ce QR n'est pas valide dans ce club.",
  RATE_LIMITED: 'Trop de requêtes. Réessayez dans un instant.',
}

// ---------------------------------------------------------------------------
// Créneaux et tarifs — CAHIER §3.3 et §3.4.
//
// Neuf créneaux d'une heure par jour, du lundi au samedi : 10h→11h … 18h→19h.
// La dernière heure commence donc à 18h, pas à 19h.
// ---------------------------------------------------------------------------

export const PREMIERE_HEURE = 10
export const DERNIERE_HEURE_DEBUT = 18
export const HEURES_CRENEAUX = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const
export type HeureCreneau = (typeof HEURES_CRENEAUX)[number]

/** Heures creuses — §3.4. Toute heure de créneau qui n'y est pas est une heure pleine. */
export const HEURES_CREUSES = [10, 11, 14, 15, 16] as const
export const HEURES_PLEINES = [12, 13, 17, 18] as const

export type Tarif = 'offpeak' | 'peak'

export function tarifDeLHeure(heure: number): Tarif {
  return (HEURES_CREUSES as readonly number[]).includes(heure) ? 'offpeak' : 'peak'
}

/**
 * Blocages boxe éducative par défaut — §3.3.
 * Mercredi (3) et samedi (6), les créneaux qui commencent à 15h et 16h.
 * Portet est paramétrable par le back-office et ne suit pas ce défaut.
 */
export const JOURS_EDUCATIVE = [3, 6] as const
export const HEURES_EDUCATIVE = [15, 16] as const
export const CLUB_EDUCATIVE_PARAMETRABLE: ClubId = 'portet'

// ---------------------------------------------------------------------------
// Réglages direction — CAHIER §3.9. Ce sont des DÉFAUTS : la source de vérité en
// exécution est la table `coach_settings`, jamais ces constantes.
// ---------------------------------------------------------------------------

export const REGLAGES_DEFAUT = {
  max_active_reservations: 3,
  capacity_per_slot: 2,
  hold_ttl_seconds: 600,
  cancel_min_hours: 24,
  qr_early_minutes: 5,
  offpeak_cents: 1000,
  peak_cents: 1500,
} as const

export type Reglages = { -readonly [K in keyof typeof REGLAGES_DEFAUT]: number }

export const FUSEAU_METIER = 'Europe/Paris' as const
export const DEVISE = 'eur' as const

/** Formatage d'un montant en centimes pour affichage français. Jamais pour un calcul. */
export function formaterCentimes(centimes: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(centimes / 100)
}
