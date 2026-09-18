/**
 * Machine à états des réservations — LOT C.
 *
 * Une réservation ne change d'état que par une transition écrite ici. Il n'existe
 * pas de « petit UPDATE » ailleurs : `confirmed` n'est atteignable que par une
 * seule ligne de ce fichier (T6), par un seul acteur (`service`, c'est-à-dire le
 * lot A de Raphael), et sous deux conditions conjointes — payé ET signé.
 *
 * Module pur : `maintenant` est reçu en paramètre et vaut le `now()` de
 * PostgreSQL (CAHIER §1.6). Aucun `Date.now()`, aucun accès base.
 *
 * L'ORDRE D'ÉVALUATION EST CONTRACTUEL, PAS ESTHÉTIQUE :
 *   visibilité → suspension → rôle → état terminal → légalité → garde.
 * Un `403 FORBIDDEN` posé avant le test de visibilité dirait à un coach B
 * « cette réservation existe et n'est pas à toi ». Un `409 CONFLICT` posé avant
 * le test de rôle dirait à un manager « tu n'avais pas le droit, mais sache que
 * la transition aurait été légale ». Chaque inversion offre un oracle gratuit.
 */

import {
  CODES_ERREUR,
  type CodeErreur,
  type Statut,
  type StatutPaiement,
  type StatutSignature,
} from './contrat.ts'

/**
 * `manager` correspond au rôle `manager_salle` du JWT (CAHIER §1.1) ; `service`
 * est le lot A (webhook Payplug, signature, checkout) ; `cron` est le ménage du
 * §5, qui n'a pas de session et n'agit que par le temps qui passe.
 */
export type Acteur =
  | { genre: 'coach'; id: string; suspendu: boolean }
  | { genre: 'manager'; clubId: string }
  | { genre: 'direction' }
  | { genre: 'service' }
  | { genre: 'cron' }

export interface Faits {
  /** `now()` de PostgreSQL, en epoch ms. Jamais l'horloge du conteneur. */
  maintenant: number
  coachId: string
  clubId: string
  debutMs: number
  finMs: number
  /** `hold_expires_at`, en epoch ms. */
  holdExpireMs: number | null
  paiement: StatutPaiement
  signature: StatutSignature
  /** `coach_settings.cancel_min_hours`, défaut 24. */
  heuresMiniAnnulation: number
}

export type Decision =
  | { ok: true }
  | { ok: false; code: CodeErreur; http: number; detail?: string }

/**
 * Le statut HTTP n'est jamais choisi ici : il est lu dans `contrat.ts`, qui
 * l'aligne sur le CAHIER §1.3. Changer l'un des deux est un changement cassant.
 */
function refus(code: CodeErreur, detail?: string): Decision {
  return detail === undefined
    ? { ok: false, code, http: CODES_ERREUR[code] }
    : { ok: false, code, http: CODES_ERREUR[code], detail }
}

const ACCEPTE: Decision = { ok: true }

/**
 * Rien ne sort de ces états. `no_show` n'y figure pas : une erreur de pointage
 * ne doit pas être définitive, la direction peut la corriger (T12, spec §8-Q6).
 */
export const STATUTS_TERMINAUX: readonly Statut[] = [
  'consumed',
  'expired',
  'payment_failed',
  'cancelled_credit',
]

export interface TransitionLegale {
  id: string
  /** `null` = création de la réservation. */
  de: Statut | null
  vers: Statut
  acteurs: readonly Acteur['genre'][]
  note: string
}

/**
 * Les douze transitions légales, et il n'y en a pas de treizième.
 * Table de référence — la vérité exécutable reste `canTransition` ci-dessous,
 * et un test vérifie que les deux disent la même chose.
 */
export const TRANSITIONS_LEGALES: readonly TransitionLegale[] = [
  { id: 'T1', de: null, vers: 'held', acteurs: ['coach'], note: 'hold de 10 minutes, siège pris' },
  {
    id: 'T2',
    de: 'held',
    vers: 'awaiting_signature',
    acteurs: ['service'],
    note: 'paiement encaissé, hold encore vivant',
  },
  { id: 'T3', de: 'held', vers: 'payment_failed', acteurs: ['service'], note: 'paiement refusé' },
  { id: 'T4', de: 'held', vers: 'expired', acteurs: ['cron'], note: 'hold périmé' },
  {
    id: 'T5',
    de: 'held',
    vers: 'expired',
    acteurs: ['coach', 'direction'],
    note: 'abandon avant paiement — AUCUN avoir',
  },
  {
    id: 'T6',
    de: 'awaiting_signature',
    vers: 'confirmed',
    acteurs: ['service'],
    note: 'LA barrière : payé ET signé',
  },
  {
    id: 'T7',
    de: 'awaiting_signature',
    vers: 'cancelled_credit',
    acteurs: ['coach', 'direction'],
    note: 'annulation > 24 h — avoir',
  },
  {
    id: 'T8',
    de: 'confirmed',
    vers: 'cancelled_credit',
    acteurs: ['coach', 'direction'],
    note: 'annulation > 24 h — avoir',
  },
  {
    id: 'T9',
    de: 'confirmed',
    vers: 'consumed',
    acteurs: ['cron', 'direction'],
    note: 'créneau écoulé',
  },
  {
    id: 'T10',
    de: 'confirmed',
    vers: 'no_show',
    acteurs: ['direction'],
    note: 'absence constatée',
  },
  {
    id: 'T11',
    de: 'awaiting_signature',
    vers: 'expired',
    acteurs: ['cron'],
    note: 'payé jamais signé, créneau passé — alerte direction',
  },
  {
    id: 'T12',
    de: 'no_show',
    vers: 'consumed',
    acteurs: ['direction'],
    note: "correction d'un pointage erroné, auditée",
  },
]

/**
 * L'acteur a-t-il le droit de VOIR cette réservation ?
 * Faux ⇒ 404, jamais 403 : l'inexistence et l'inaccessibilité doivent être
 * indistinguables, corps d'erreur compris (CAHIER §1.3, test 13.1).
 */
export function canSee(acteur: Acteur, faits: Faits): boolean {
  switch (acteur.genre) {
    case 'coach':
      return acteur.id === faits.coachId
    case 'manager':
      return acteur.clubId === faits.clubId
    case 'direction':
    case 'service':
    case 'cron':
      return true
  }
}

/** Le paiement est acquis : encaissé par carte, ou soldé par un avoir. */
function estPaye(paiement: StatutPaiement): boolean {
  return paiement === 'paid' || paiement === 'waived_credit'
}

/**
 * Limite d'annulation : 24 HEURES ABSOLUES avant le début (spec §1.6, option A).
 *
 * Pas « la même heure la veille » : une fenêtre de remboursement est une durée,
 * pas un rendez-vous. Le week-end de bascule de printemps, la lecture « veille »
 * ne laisserait que 23 h au coach, qui perdrait son avoir pour une raison
 * qu'aucun humain ne pourrait lui expliquer au téléphone.
 *
 * La frontière est stricte : à 24 h pile, il est déjà trop tard.
 */
export function limiteAnnulationMs(faits: Faits): number {
  return faits.debutMs - faits.heuresMiniAnnulation * 3_600_000
}

export function canTransition(
  from: Statut,
  to: Statut,
  acteur: Acteur,
  faits: Faits,
): Decision {
  // 1) Visibilité.
  if (!canSee(acteur, faits)) return refus('NOT_FOUND')

  // 2) Suspension — le coach connaît l'existence de son propre compte : 403 est
  //    honnête ici, et un 404 l'empêcherait de comprendre et de régulariser.
  if (acteur.genre === 'coach' && acteur.suspendu) return refus('SUSPENDED')

  // 3) Le manager de salle est en LECTURE SEULE sur les réservations (CAHIER §10).
  //    Ses seuls écrits sont les blocages de créneaux de son club.
  if (acteur.genre === 'manager') return refus('FORBIDDEN', 'manager_read_only')

  // 4) Rien ne sort d'un état terminal.
  if (STATUTS_TERMINAUX.includes(from)) return refus('CONFLICT', `terminal:${from}`)

  const estProprietaire = acteur.genre === 'coach' && acteur.id === faits.coachId

  switch (`${from}->${to}`) {
    // T2 — paiement encaissé.
    case 'held->awaiting_signature': {
      if (acteur.genre !== 'service') return refus('FORBIDDEN')
      if (!estPaye(faits.paiement)) return refus('PAYMENT_REQUIRED')
      // Webhook arrivé après la mort du hold : le siège a pu être repris.
      // C'est la frontière A/C (spec §8-Q5) — l'argent est là, le siège non.
      if (faits.holdExpireMs === null || faits.holdExpireMs <= faits.maintenant) {
        return refus('HOLD_EXPIRED')
      }
      return ACCEPTE
    }

    // T3 — paiement refusé : le siège est libéré.
    case 'held->payment_failed':
      return acteur.genre === 'service' ? ACCEPTE : refus('FORBIDDEN')

    // T4 / T5 — un hold qui meurt : par le temps, ou par le coach lui-même.
    case 'held->expired': {
      if (acteur.genre === 'cron') {
        return faits.holdExpireMs !== null && faits.holdExpireMs <= faits.maintenant
          ? ACCEPTE
          : refus('CONFLICT', 'hold_still_alive')
      }
      // Aucun avoir : rien n'a été payé (CAHIER §6). Voir `avoirs.ts`.
      if (estProprietaire || acteur.genre === 'direction') return ACCEPTE
      return refus('FORBIDDEN')
    }

    // T6 — LA BARRIÈRE. Payé ET signé, dans cet ordre de vérification.
    case 'awaiting_signature->confirmed': {
      if (acteur.genre !== 'service') return refus('FORBIDDEN')
      if (!estPaye(faits.paiement)) return refus('PAYMENT_REQUIRED')
      if (faits.signature !== 'signed') return refus('SIGNATURE_REQUIRED')
      return ACCEPTE
    }

    // T7 / T8 — annulation avec avoir.
    case 'awaiting_signature->cancelled_credit':
    case 'confirmed->cancelled_credit': {
      if (!estProprietaire && acteur.genre !== 'direction') return refus('FORBIDDEN')
      if (faits.maintenant >= limiteAnnulationMs(faits)) return refus('CANCEL_TOO_LATE')
      return ACCEPTE
    }

    // T9 — créneau écoulé.
    case 'confirmed->consumed': {
      if (acteur.genre !== 'cron' && acteur.genre !== 'direction') return refus('FORBIDDEN')
      return faits.finMs <= faits.maintenant ? ACCEPTE : refus('CONFLICT', 'slot_not_over')
    }

    // T10 — absence constatée.
    case 'confirmed->no_show': {
      if (acteur.genre !== 'direction') return refus('FORBIDDEN')
      return faits.finMs <= faits.maintenant ? ACCEPTE : refus('CONFLICT', 'slot_not_over')
    }

    // T11 — payé, jamais signé, créneau passé. L'argent est encaissé : on expire
    //       la ligne ET on alerte la direction. Aucun remboursement automatique :
    //       c'est de l'argent, donc un arbitrage humain (spec §8-Q2).
    case 'awaiting_signature->expired': {
      if (acteur.genre !== 'cron') return refus('FORBIDDEN')
      if (faits.finMs > faits.maintenant) return refus('CONFLICT', 'slot_not_over')
      if (faits.signature === 'signed') return refus('CONFLICT', 'already_signed')
      return ACCEPTE
    }

    // T12 — correction d'un `no_show` posé par erreur.
    case 'no_show->consumed':
      return acteur.genre === 'direction' ? ACCEPTE : refus('FORBIDDEN')

    // Tout le reste, `held->confirmed` compris : court-circuiter le paiement ET
    // la signature est exactement ce que la barrière du CAHIER §2 interdit.
    default:
      return refus('CONFLICT', `${from}->${to}`)
  }
}

export interface FaitsCreation {
  maintenant: number
  debutMs: number
  coachId: string
}

export interface ContexteCreation {
  /** Résultat de `verifierCreneauReservable` de `creneaux.ts` : `null` = grille OK. */
  creneauInvalide: boolean
  bloque: boolean
  pris: number
  capacite: number
  /** Compté sur le prédicat d'occupation, jamais sur le statut seul. */
  activesDuCoach: number
  maxActives: number
  dejaReserveParCeCoach: boolean
}

/**
 * T1 — poser un hold. Miroir TS des gardes de `coach_hold_slot()`.
 *
 * L'ordre suit celui de la fonction PostgreSQL, à une exception assumée :
 * « ce coach a déjà ce créneau » est testé AVANT `SLOT_FULL`. Répondre
 * « complet (2 coachs) » à quelqu'un qui reclique sur sa propre réservation est
 * un mensonge et un ticket de support garanti (spec §8-Q10).
 *
 * La base reste l'arbitre : l'index unique partiel refuse le troisième siège
 * même si tout ce fichier est faux. Cette fonction sert à répondre juste, pas à
 * protéger la capacité.
 */
export function peutPoserUnHold(
  acteur: Acteur,
  faits: FaitsCreation,
  contexte: ContexteCreation,
): Decision {
  if (acteur.genre !== 'coach') return refus('FORBIDDEN')
  if (acteur.suspendu) return refus('SUSPENDED')
  if (acteur.id !== faits.coachId) return refus('FORBIDDEN')
  if (contexte.creneauInvalide) return refus('VALIDATION_ERROR')
  if (faits.debutMs <= faits.maintenant) return refus('VALIDATION_ERROR', 'past')
  if (contexte.bloque) return refus('SLOT_BLOCKED')
  if (contexte.activesDuCoach >= contexte.maxActives) return refus('ACTIVE_LIMIT')
  if (contexte.dejaReserveParCeCoach) return refus('CONFLICT', 'already_booked')
  if (contexte.pris >= contexte.capacite) return refus('SLOT_FULL')
  return ACCEPTE
}
