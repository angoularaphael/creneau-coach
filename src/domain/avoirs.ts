/**
 * Avoirs (`coach_credits`) — LOT C.
 *
 * Un avoir naît d'une annulation faite à plus de 24 heures du créneau, et de rien
 * d'autre. Son montant est celui FIGÉ à la réservation (`amount_cents` au moment
 * du hold) : ni le tarif du jour, ni le tarif actuel du créneau. Un changement de
 * tarif par la direction ne rétroagit jamais (CAHIER §3.5, §6).
 *
 * ARBITRAGE ASSUMÉ (spec §4.2). Le cahier dit deux choses incompatibles :
 * `amount_cents` y est décrit comme « le reste », mais la phrase suivante décrit
 * un jeton à valeur fixe, et l'énumération `available | consumed | expired` n'a
 * pas d'état « partiellement consommé ». Le cas qui tranche : avoir de 15 €,
 * créneau à 10 €. Le tout-ou-rien ferait perdre 5 € au coach sur une annulation
 * qui lui donnait droit à 15 € — indéfendable au téléphone. On retient donc le
 * DÉCRÉMENT : l'avoir passe de 1500 à 500 et reste `available`. Aucun état
 * nouveau, et le mot « reste » du cahier devient vrai.
 *
 * Et pas de paiement mixte : `provider = 'credit'` est accepté si et seulement si
 * le solde couvre le montant entier. Sinon `400 VALIDATION_ERROR` avec
 * `details.reason = 'insufficient_credit'` — un `details` additif, là où un
 * nouveau code d'erreur serait un changement cassant au sens du CAHIER §14.
 *
 * Module pur : `maintenant` est reçu en paramètre (le `now()` de PostgreSQL).
 * La concurrence, elle, n'est PAS traitée ici : deux onglets qui dépensent le
 * même avoir sont arbitrés par `coach_spend_credits()` et son `for update`
 * ordonné. Ce fichier décide, la base garantit.
 */

import { type CodeErreur, type Statut } from './contrat.ts'
import {
  canTransition,
  type Acteur,
  type Decision,
  type Faits,
} from './etats.ts'

export type StatutAvoir = 'available' | 'consumed' | 'expired'

export interface Avoir {
  id: string
  /** LE RESTE, en centimes. Décrémenté à chaque consommation. Jamais négatif. */
  montantCents: number
  statut: StatutAvoir
  /** `created_at` en epoch ms — porte l'ordre FIFO. */
  creeLeMs: number
  /**
   * spec §8-Q7 : le statut `expired` existe dans l'énumération alors qu'aucune
   * colonne de date ne le rend atteignable. Tant que la direction n'a pas tranché
   * (c'est une position commerciale, pas technique), `null` = pas d'expiration,
   * et le comportement est celui d'aujourd'hui.
   */
  expireLeMs?: number | null
  origineReservationId?: string
}

/** `details.reason` du refus, additif au contrat (CAHIER §1.3 n'a pas de code dédié). */
export const RAISON_AVOIR_INSUFFISANT = 'insufficient_credit'

export function estDisponible(avoir: Avoir, maintenant: number): boolean {
  if (avoir.statut !== 'available') return false
  if (avoir.montantCents <= 0) return false
  const expire = avoir.expireLeMs ?? null
  return expire === null || expire > maintenant
}

/**
 * Solde du coach, en centimes : c'est `credits_cents` de `GET /me`.
 * Somme des avoirs disponibles — jamais un champ stocké, pour qu'aucune
 * désynchronisation ne soit possible entre le solde affiché et les lignes.
 */
export function soldeAvoirs(avoirs: readonly Avoir[], maintenant: number): number {
  let total = 0
  for (const a of avoirs) if (estDisponible(a, maintenant)) total += a.montantCents
  return total
}

export interface MouvementAvoir {
  creditId: string
  /** Négatif : c'est une consommation. */
  deltaCents: number
  /** Reste de CET avoir après le mouvement. Jamais négatif. */
  soldeApres: number
  /** L'avoir passe-t-il `consumed` ? */
  epuise: boolean
}

export type PlanDepense =
  | {
      ok: true
      mouvements: readonly MouvementAvoir[]
      totalCents: number
      /** Solde du coach après l'opération. */
      soldeApres: number
    }
  | {
      ok: false
      code: CodeErreur
      raison: typeof RAISON_AVOIR_INSUFFISANT
      details: { credits_cents: number; amount_cents: number }
    }

/**
 * Consommation FIFO, du plus ancien avoir au plus récent, décrément partiel
 * autorisé sur le dernier avoir touché.
 *
 * L'ordre `(creeLeMs, id)` est TOTAL et identique pour tous les appelants : c'est
 * le même que le `order by created_at asc, id asc` de `coach_spend_credits()`,
 * et c'est ce qui empêche deux transactions concurrentes de s'interbloquer en
 * verrouillant les mêmes avoirs dans des ordres différents.
 *
 * Tout ou rien : si le solde ne couvre pas le montant, aucun mouvement n'est
 * produit et le solde reste strictement inchangé.
 */
export function planifierDepense(
  avoirs: readonly Avoir[],
  montantCents: number,
  maintenant: number,
): PlanDepense {
  if (!Number.isInteger(montantCents) || montantCents <= 0) {
    // Le montant vient d'`amount_cents`, figé côté serveur : s'il est absurde,
    // c'est un bug d'appelant, pas une erreur de l'utilisateur.
    throw new Error(`avoirs: montant à dépenser invalide (${montantCents})`)
  }

  const solde = soldeAvoirs(avoirs, maintenant)
  if (solde < montantCents) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      raison: RAISON_AVOIR_INSUFFISANT,
      details: { credits_cents: solde, amount_cents: montantCents },
    }
  }

  const fifo = avoirs
    .filter((a) => estDisponible(a, maintenant))
    .slice()
    .sort((a, b) => (a.creeLeMs !== b.creeLeMs ? a.creeLeMs - b.creeLeMs : compare(a.id, b.id)))

  const mouvements: MouvementAvoir[] = []
  let reste = montantCents
  for (const avoir of fifo) {
    if (reste <= 0) break
    const prise = Math.min(avoir.montantCents, reste)
    const soldeApres = avoir.montantCents - prise
    mouvements.push({
      creditId: avoir.id,
      deltaCents: -prise,
      soldeApres,
      epuise: soldeApres === 0,
    })
    reste -= prise
  }

  // Ceinture : le solde a été vérifié, cette branche ne doit jamais s'ouvrir.
  if (reste > 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      raison: RAISON_AVOIR_INSUFFISANT,
      details: { credits_cents: solde, amount_cents: montantCents },
    }
  }

  return {
    ok: true,
    mouvements,
    totalCents: montantCents,
    soldeApres: solde - montantCents,
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Applique un plan et rend le nouvel état des avoirs. Pur : l'entrée n'est pas
 * modifiée. Sert aux tests et au calcul d'un aperçu côté back-office ; en
 * production, c'est PostgreSQL qui écrit, dans la transaction du checkout.
 */
export function appliquerDepense(
  avoirs: readonly Avoir[],
  mouvements: readonly MouvementAvoir[],
): Avoir[] {
  const parId = new Map<string, MouvementAvoir>()
  for (const m of mouvements) parId.set(m.creditId, m)
  return avoirs.map((a) => {
    const m = parId.get(a.id)
    if (!m) return { ...a }
    return { ...a, montantCents: m.soldeApres, statut: m.epuise ? 'consumed' : a.statut }
  })
}

export interface LigneRegistre {
  creditId: string
  /** `null` = création de l'avoir. */
  reservationId: string | null
  deltaCents: number
  soldeApres: number
}

/**
 * Registre append-only (`coach_credit_ledger`) : le « reste » doit rester
 * reconstructible ligne à ligne, pour qu'aucune réclamation ne se règle à l'estime.
 */
export function registreDepense(
  mouvements: readonly MouvementAvoir[],
  reservationId: string,
): LigneRegistre[] {
  return mouvements.map((m) => ({
    creditId: m.creditId,
    reservationId,
    deltaCents: m.deltaCents,
    soldeApres: m.soldeApres,
  }))
}

export function registreCreation(creditId: string, montantCents: number): LigneRegistre {
  return { creditId, reservationId: null, deltaCents: montantCents, soldeApres: montantCents }
}

/**
 * spec §8-Q1 : l'énumération n'a pas de `cancelled` sans avoir, et
 * `cancelled_credit` mentirait sur un hold que personne n'a payé. On réutilise
 * donc `expired` et on distingue les deux cas par cette raison, additive et non
 * cassante, pour que Brad affiche le bon texte.
 */
export type RaisonAnnulation = 'coach_cancelled' | 'hold_timeout'

export type PlanAnnulation =
  | { ok: false; code: CodeErreur; http: number; detail?: string }
  | {
      ok: true
      versStatut: Statut
      raison: RaisonAnnulation
      /** `null` = aucun avoir créé. */
      avoir: { montantCents: number } | null
    }

/**
 * Décide, en une fois, l'annulation demandée : la transition ET l'avoir.
 *
 * - `held` annulé à la main → `expired`, AUCUN avoir : rien n'a été payé (CAHIER §6).
 * - `awaiting_signature` / `confirmed` à plus de 24 h → `cancelled_credit` + un
 *   avoir du montant figé.
 * - à moins de 24 h → `409 CANCEL_TOO_LATE`, aucun avoir, aucun remboursement.
 *
 * La garde des 24 h n'est pas réécrite ici : elle est demandée à `canTransition`,
 * seule autorité sur les transitions. Deux copies d'une règle de remboursement
 * finiraient par diverger, et c'est de l'argent.
 *
 * `montantCentsFiges` est `coach_reservations.amount_cents` — le prix inscrit à
 * la réservation, jamais recalculé.
 */
export function planifierAnnulation(
  statutCourant: Statut,
  acteur: Acteur,
  faits: Faits,
  montantCentsFiges: number,
): PlanAnnulation {
  const cible: Statut = statutCourant === 'held' ? 'expired' : 'cancelled_credit'
  const decision: Decision = canTransition(statutCourant, cible, acteur, faits)
  if (!decision.ok) return decision

  if (cible === 'expired') {
    return { ok: true, versStatut: 'expired', raison: 'coach_cancelled', avoir: null }
  }
  if (!Number.isInteger(montantCentsFiges) || montantCentsFiges <= 0) {
    throw new Error(`avoirs: montant figé invalide (${montantCentsFiges})`)
  }
  return {
    ok: true,
    versStatut: 'cancelled_credit',
    raison: 'coach_cancelled',
    avoir: { montantCents: montantCentsFiges },
  }
}

/**
 * Le ménage du cron : un hold périmé s'éteint sans avoir et sans bruit.
 *
 * Aucun cron ne crée jamais d'avoir. Un avoir est un `INSERT`, et la livraison
 * des crons est « best effort » : un run rejoué en fabriquerait deux. Les avoirs
 * ne naissent que d'un `POST /reservations/{id}/cancel` explicite, porteur d'une
 * `Idempotency-Key`, dans la même transaction que la transition.
 */
export function planifierExpirationParCron(faits: Faits): PlanAnnulation {
  const decision = canTransition('held', 'expired', { genre: 'cron' }, faits)
  if (!decision.ok) return decision
  return { ok: true, versStatut: 'expired', raison: 'hold_timeout', avoir: null }
}
