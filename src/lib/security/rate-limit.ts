import 'server-only'

import { MESSAGES_ERREUR } from '@/domain/contrat'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Limite de débit — spec-04 §3.
 *
 * ═══ POURQUOI PAS LE `Map()` EN MÉMOIRE D'AMAZ ═══
 * Deux défauts, et le second est le pire.
 *   1. `const store = new Map()` vit dans UNE instance de fonction Vercel. Cold
 *      start, scale-out : le compteur repart à zéro. « 5/min » devient « 5/min
 *      par instance », c'est-à-dire aucune limite.
 *   2. `listeNoire.push(identifiant)` : un dépassement unique vaut bannissement
 *      DÉFINITIF, sans TTL, sans voie de sortie. Le wifi du club des Minimes,
 *      c'est UNE IP publique pour tous les coachs présents : un coach qui
 *      rafraîchit sa grille un peu vite bannit tout le club jusqu'au prochain
 *      déploiement. Ce comportement est supprimé, pas porté.
 *
 * ═══ POURQUOI POSTGRES ═══
 * Aucun service de plus à facturer ni surveiller ; toutes les régions tapent la
 * même base donc la limite est EXACTE (le WAF Vercel compte par région, Upstash
 * déconseille `slidingWindow` en multi-région) ; et les dépassements sont
 * joignables à `coach_audit_logs`. `RATE_LIMIT_REDIS_URL` reste une échappatoire :
 * le jour où la charge le justifie, seule l'implémentation change, pas la
 * signature ci-dessous.
 */

export type RegleLimite = {
  readonly limit: number
  readonly windowSeconds: number
  /**
   * Que faire si la base ne répond pas — spec-04 §3.6.
   *
   * `false` (fail-open) pour les routes authentifiées : elles ont de toute façon
   * besoin de la base deux lignes plus loin, le fail-open y est théorique, et
   * une base lente ne doit pas empêcher un coach de réserver.
   *
   * `true` (fail-closed) pour `POST /contact` : route NON authentifiée, sans
   * valeur métier si elle tombe, et la seule porte ouverte à l'internet entier.
   * Un fail-open dessus, c'est un relais de spam gratuit pendant l'incident.
   */
  readonly failClosed: boolean
}

/** Limites du cahier §1.5. Une seule source de vérité. */
export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 60, failClosed: true },
  reservations: { limit: 10, windowSeconds: 60, failClosed: false },
  checkout: { limit: 5, windowSeconds: 60, failClosed: false },
  signature: { limit: 10, windowSeconds: 60, failClosed: false },
  contact: { limit: 5, windowSeconds: 3600, failClosed: true },
} as const satisfies Record<string, RegleLimite>

export type NomLimite = keyof typeof RATE_LIMITS

export type VerdictLimite = {
  readonly allowed: boolean
  /** `-1` quand le compteur est indisponible : on n'invente pas un chiffre faux. */
  readonly remaining: number
  readonly retryAfterSeconds: number
  /** La dimension qui a refusé, pour l'audit. `null` si autorisé. */
  readonly dimension: 'ip' | 'coach' | null
  /** Vrai si la base n'a pas répondu — à journaliser, jamais à ignorer. */
  readonly indisponible: boolean
}

type LigneVerdict = { allowed: boolean; remaining: number; retry_after_s: number }

/**
 * Consomme N buckets de façon ATOMIQUE et TOUT-OU-RIEN.
 *
 * Le cahier §1.5 limite par IP **et** par coach. Si les deux dimensions étaient
 * deux appels séparés, un refus sur l'IP brûlerait quand même un jeton sur le
 * coach : un coach au bureau derrière une IP saturée perdrait son quota personnel
 * sans avoir rien obtenu. La fonction Postgres regarde les deux d'abord, et ne
 * consomme que si les deux passent.
 */
export async function checkRateLimit(
  nom: NomLimite,
  dims: { readonly ipHash: string; readonly coachId?: string | null },
): Promise<VerdictLimite> {
  const regle = RATE_LIMITS[nom]

  const buckets = [`${nom}:ip:${dims.ipHash}`]
  if (dims.coachId) buckets.push(`${nom}:coach:${dims.coachId}`)

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('coach_rate_limit_check', {
    p_buckets: buckets,
    p_limit: regle.limit,
    p_window_s: regle.windowSeconds,
  })

  if (error) {
    // Décision ASSUMÉE et journalisée. Un fail-open silencieux est une porte
    // ouverte que personne ne voit jamais ; celui-ci crie.
    console.warn('[rate-limit] compteur indisponible', {
      nom,
      failClosed: regle.failClosed,
      code: error.code,
    })
    return {
      allowed: !regle.failClosed,
      remaining: -1,
      retryAfterSeconds: regle.failClosed ? 60 : 0,
      dimension: null,
      indisponible: true,
    }
  }

  const ligne = (Array.isArray(data) ? data[0] : data) as LigneVerdict | undefined
  const allowed = Boolean(ligne?.allowed)

  return {
    allowed,
    remaining: Number(ligne?.remaining ?? 0),
    retryAfterSeconds: Number(ligne?.retry_after_s ?? 0),
    // On ne sait pas laquelle des deux dimensions a refusé (la fonction rend un
    // verdict global). On journalise donc la plus spécifique disponible, et on
    // ne prétend pas savoir ce qu'on ne sait pas.
    dimension: allowed ? null : dims.coachId ? 'coach' : 'ip',
    indisponible: false,
  }
}

/**
 * Réponse 429 conforme au contrat §1.3.
 *
 * `Retry-After` est un en-tête standard (RFC 9110). Les en-têtes `RateLimit-*`
 * sont un draft IETF : optionnels, on ne les pose pas en v1 — un en-tête non
 * stabilisé dans un contrat qui lie trois lots pour des mois, ça se retire mal.
 */
export function reponse429(verdict: VerdictLimite, requestId: string): Response {
  const retry = Math.max(1, verdict.retryAfterSeconds || 1)
  const corps = {
    error: {
      code: 'RATE_LIMITED' as const,
      message: MESSAGES_ERREUR.RATE_LIMITED,
      details: { retry_after_seconds: retry, request_id: requestId },
    },
  }
  return new Response(JSON.stringify(corps), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(retry),
      'x-request-id': requestId,
    },
  })
}
