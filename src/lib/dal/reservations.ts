import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { CODES_ERREUR, type ClubId, type CodeErreur, type Statut } from '@/domain/contrat'
import { erreur } from '@/lib/http/erreurs'
import type { ContexteRequete } from '@/lib/security/request-context'
import type { ListReservationsQuery } from '@/lib/security/schemas/reservations'

import { echec, refuserRessource, succes, type ActeurCourant, type ResultatDal } from './acteur'

/**
 * Réservations — lecture sous RLS, écriture par fonction PL/pgSQL.
 *
 * ═══ POURQUOI LES ÉCRITURES PASSENT PAR UNE FONCTION SQL ═══
 * PostgREST ne donne pas de transaction multi-instruction. Or la réservation de
 * la clé d'idempotence et la création du hold DOIVENT être dans la même
 * transaction : sinon le hold est créé, la fonction serverless meurt avant la
 * clôture, le coach rejoue, le bail expire, et il obtient un SECOND hold —
 * exactement ce que le test contractuel §13.13 interdit.
 * `coach_create_hold` fait tout dans l'ordre et dans une transaction : bail
 * d'idempotence → contrôles métier → tarif → comptage des actives → verrou
 * consultatif sur (espace, heure) → INSERT → clôture de la clé.
 *
 * ═══ POURQUOI AVEC LE CLIENT DE SESSION ET PAS `service_role` ═══
 * `coach_create_hold` lit `auth.uid()`. Appelée avec la clé de service, elle
 * verrait `null` et refuserait — et si elle ne refusait pas, ce serait pire :
 * n'importe quelle route pourrait réserver au nom de n'importe qui. La fonction
 * est `grant execute … to authenticated` : c'est le jeton du coach qui l'appelle.
 */

/** Colonnes exactement grantées à `authenticated` (migration 0013). */
const COLONNES_RESERVATION = [
  'id',
  'coach_id',
  'club_id',
  'space_id',
  'starts_at',
  'ends_at',
  'amount_cents',
  'currency',
  'status',
  'payment_status',
  'payment_provider',
  'signature_status',
  'signed_at',
  'deciplus_job_status',
  'hold_expires_at',
  'qr_valid_from',
  'qr_valid_to',
  'cancelled_at',
  'credit_id',
  'created_at',
].join(', ')
// Volontairement ABSENTS, et non grantés en base non plus : qr_jti,
// signature_pdf_path, payment_id, seat, idempotency_key, cancel_reason.
// Deux murs pour la même règle : si quelqu'un ajoute une colonne ici, Postgres
// refuse quand même.

export type Reservation = {
  id: string
  coach_id: string
  club_id: string
  space_id: string
  starts_at: string
  ends_at: string
  amount_cents: number
  currency: string
  status: Statut
  payment_status: string
  payment_provider: string | null
  signature_status: string
  signed_at: string | null
  deciplus_job_status: string
  hold_expires_at: string | null
  qr_valid_from: string | null
  qr_valid_to: string | null
  cancelled_at: string | null
  credit_id: string | null
  created_at: string
}

/**
 * Enveloppe rendue par les fonctions PL/pgSQL du lot C.
 *
 * Elles RETOURNENT un refus, elles ne le `RAISE` pas : un `RAISE` annulerait la
 * transaction, donc la trace d'idempotence avec elle. Le code d'erreur est déjà
 * celui du contrat §1.3 — on ne le retraduit pas, on le vérifie.
 */
type EnveloppeRpc =
  | { ok: true; reservation?: unknown; credit?: unknown; [k: string]: unknown }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }

function estCodeContrat(valeur: string): valeur is CodeErreur {
  return Object.prototype.hasOwnProperty.call(CODES_ERREUR, valeur)
}

/**
 * Traduit l'enveloppe SQL en `ErreurMetier`.
 *
 * Un code inconnu ne devient JAMAIS un message affiché tel quel : ce serait
 * laisser la base dicter le contrat, et fuiter un jour un `sqlerrm`. Il devient
 * un `CONFLICT` générique, et le vrai code part dans les journaux serveur.
 */
function depuisEnveloppe(reponse: EnveloppeRpc, requestId: string) {
  if (reponse.ok) return null
  const { code, message, details } = reponse.error
  if (!estCodeContrat(code)) {
    console.error(`[${requestId}] code d'erreur SQL hors contrat`, { code })
    return erreur('CONFLICT', {})
  }
  return erreur(code, details ?? {}, message)
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

export type EntreeHold = {
  readonly clubId: ClubId
  readonly spaceId: string
  readonly startsAt: string
  readonly idempotencyKey: string
}

export async function creerHold(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  entree: EntreeHold,
): Promise<ResultatDal<unknown>> {
  const { data, error } = await supabase.rpc('coach_create_hold', {
    p_club_id: entree.clubId,
    p_space_id: entree.spaceId,
    p_starts_at: entree.startsAt,
    p_idempotency_key: entree.idempotencyKey,
  })

  if (error) {
    // Une erreur PostgREST ici est une panne, pas un refus métier : les refus
    // reviennent DANS `data`, sous forme d'enveloppe. On ne renvoie donc jamais
    // `error.message` au client — il contient le SQLSTATE et parfois le SQL.
    console.error(`[${ctx.requestId}] coach_create_hold`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  const reponse = data as EnveloppeRpc
  const refus = depuisEnveloppe(reponse, ctx.requestId)
  if (refus) return echec(refus)

  return succes((reponse as { reservation?: unknown }).reservation ?? reponse)
}

export async function annulerReservation(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  entree: { readonly reservationId: string; readonly idempotencyKey: string },
): Promise<ResultatDal<unknown>> {
  const { data, error } = await supabase.rpc('coach_cancel_reservation', {
    p_reservation_id: entree.reservationId,
    p_idempotency_key: entree.idempotencyKey,
  })

  if (error) {
    console.error(`[${ctx.requestId}] coach_cancel_reservation`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  const reponse = data as EnveloppeRpc
  const refus = depuisEnveloppe(reponse, ctx.requestId)
  if (refus) return echec(refus)

  return succes(reponse)
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/**
 * Lecture d'UNE réservation — test contractuel §13.1 (anti-IDOR).
 *
 * La RLS ne rend que les lignes du coach (ou de son club pour un manager, ou
 * toutes pour la direction). Une réservation qui appartient à un autre coach
 * revient donc « absente », et le 404 tombe tout seul. On ne l'obtient pas par
 * un `if` qu'on pourrait oublier : on l'obtient parce que Postgres ne l'a pas
 * rendue. La ligne d'audit, elle, garde la vraie raison.
 */
export async function lireReservation(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  acteur: ActeurCourant,
  id: string,
): Promise<ResultatDal<Reservation>> {
  const { data, error } = await supabase
    .from('coach_reservations')
    .select(COLONNES_RESERVATION)
    .eq('id', id)
    .maybeSingle<Reservation>()

  if (error) {
    console.error(`[${ctx.requestId}] lecture réservation`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  if (!data) {
    return echec(
      await refuserRessource(ctx, acteur, {
        type: 'reservation',
        id,
        raison: 'invisible_sous_rls',
      }),
    )
  }

  return succes(data)
}

export type PageReservations = {
  readonly items: Reservation[]
  /** `created_at` de la dernière ligne : curseur opaque côté client. */
  readonly nextCursor: string | null
}

/**
 * Liste paginée.
 *
 * Pagination par CURSEUR et non par `offset` : sur une table qui bouge (un hold
 * expire pendant la pagination), un `offset` saute ou duplique des lignes. Le
 * curseur est un `created_at`, et le tri est strictement décroissant dessus.
 */
export async function listerReservations(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  filtres: ListReservationsQuery,
  perimetre: { readonly clubId: ClubId | null; readonly coachId: string | null },
): Promise<ResultatDal<PageReservations>> {
  let requete = supabase
    .from('coach_reservations')
    .select(COLONNES_RESERVATION)
    .order('created_at', { ascending: false })
    .limit(filtres.limit)

  // Ces filtres NE SONT PAS des contrôles d'accès : ils affinent une requête que
  // la RLS a déjà bornée. Le périmètre a été décidé par `perimetreClub`.
  if (perimetre.clubId) requete = requete.eq('club_id', perimetre.clubId)
  if (perimetre.coachId) requete = requete.eq('coach_id', perimetre.coachId)
  if (filtres.status) requete = requete.eq('status', filtres.status)
  if (filtres.from) requete = requete.gte('starts_at', `${filtres.from}T00:00:00+00:00`)
  if (filtres.to) requete = requete.lte('starts_at', `${filtres.to}T23:59:59+00:00`)
  if (filtres.cursor) requete = requete.lt('created_at', filtres.cursor)

  const { data, error } = await requete.returns<Reservation[]>()

  if (error) {
    console.error(`[${ctx.requestId}] liste réservations`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  const items = data ?? []
  const dernier = items.length === filtres.limit ? items[items.length - 1] : undefined

  return succes({ items, nextCursor: dernier ? dernier.created_at : null })
}
