import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ClubId } from '@/domain/contrat'
import { erreur } from '@/lib/http/erreurs'
import type { ContexteRequete } from '@/lib/security/request-context'
import type { AdminReservationsQuery, AuditQuery } from '@/lib/security/schemas/admin'

import { echec, succes, type ResultatDal } from './acteur'

/**
 * Back-office — cahier §10 et §12.
 *
 * Tout passe par les VUES `coach_*_staff` (migration 0014), pas par les tables :
 * elles projettent exactement les colonnes de la matrice §12. La liste des
 * réservations rend `signed` et `qr_ready` en BOOLÉENS — jamais le PDF, jamais
 * le token QR, jamais l'identifiant Deciplus.
 */

const COLONNES_RES_STAFF = [
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
  'signed',
  'signed_at',
  'deciplus_job_status',
  'qr_ready',
  'hold_expires_at',
  'cancelled_at',
  'credit_id',
  'created_at',
].join(', ')

export type ReservationStaff = {
  id: string
  coach_id: string
  club_id: string
  space_id: string
  starts_at: string
  ends_at: string
  amount_cents: number
  currency: string
  status: string
  payment_status: string
  payment_provider: string | null
  signed: boolean
  signed_at: string | null
  deciplus_job_status: string
  qr_ready: boolean
  hold_expires_at: string | null
  cancelled_at: string | null
  credit_id: string | null
  created_at: string
}

export type PageStaff<T> = { readonly items: T[]; readonly nextCursor: string | null }

/**
 * `clubEffectif` vient de `perimetreClub()` : `null` ne veut dire « tous les
 * clubs » QUE pour une direction. Un manager reçoit toujours son club, jamais
 * `null` — c'est la garantie du test §13.2, et elle est prise avant d'arriver
 * ici. La vue est en `security_invoker`, donc la RLS de `coach_reservations`
 * refiltre derrière : deux murs, encore.
 */
export async function listerReservationsStaff(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  clubEffectif: ClubId | null,
  filtres: AdminReservationsQuery,
): Promise<ResultatDal<PageStaff<ReservationStaff>>> {
  let requete = supabase
    .from('coach_reservations_staff')
    .select(COLONNES_RES_STAFF)
    .order('created_at', { ascending: false })
    .limit(filtres.limit)

  if (clubEffectif) requete = requete.eq('club_id', clubEffectif)
  if (filtres.space_id) requete = requete.eq('space_id', filtres.space_id)
  if (filtres.coach_id) requete = requete.eq('coach_id', filtres.coach_id)
  if (filtres.status) requete = requete.eq('status', filtres.status)
  if (filtres.from) requete = requete.gte('starts_at', `${filtres.from}T00:00:00+00:00`)
  if (filtres.to) requete = requete.lte('starts_at', `${filtres.to}T23:59:59+00:00`)
  if (filtres.cursor) requete = requete.lt('created_at', filtres.cursor)

  const { data, error } = await requete.returns<ReservationStaff[]>()

  if (error) {
    console.error(`[${ctx.requestId}] liste staff`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  const items = data ?? []
  const dernier = items.length === filtres.limit ? items[items.length - 1] : undefined
  return succes({ items, nextCursor: dernier ? dernier.created_at : null })
}

export type CoachStaff = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  status: string
  active_reservations_count: number
}

/**
 * `coach_coaches_staff` est une vue `security_definer` ASSUMÉE : la matrice §12
 * exige des colonnes différentes selon le rôle, ce qu'aucun GRANT ne sait
 * exprimer. Son `WHERE` REMPLACE la RLS — c'est-à-dire qu'il EST le contrôle
 * d'accès. On ne filtre donc pas le club ici « pour aider » : on laisse la vue
 * décider, sinon on aurait deux vérités sur la même règle.
 */
export async function listerCoachsStaff(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  limite = 50,
): Promise<ResultatDal<CoachStaff[]>> {
  const { data, error } = await supabase
    .from('coach_coaches_staff')
    .select('id, first_name, last_name, email, phone, status, active_reservations_count')
    .order('last_name', { ascending: true })
    .limit(limite)
    .returns<CoachStaff[]>()

  if (error) {
    console.error(`[${ctx.requestId}] liste coachs staff`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }
  return succes(data ?? [])
}

export type LigneAuditLue = {
  id: string
  actor_id: string | null
  role: string | null
  action: string
  club_id: string | null
  target_type: string | null
  target_id: string | null
  meta: Record<string, unknown>
  created_at: string
}

/**
 * `GET /admin/audit` — manager : son club seulement (policy
 * `coach_audit_lecture_manager`).
 *
 * Rappel de ce que ça implique pour `audit.ts` : ce journal EST UNE SURFACE
 * EXPOSÉE. Tout ce qu'on écrit dans `meta` est lisible par un manager de salle.
 * C'est la raison d'être de la liste blanche `safeMeta()`, pas une précaution
 * décorative.
 */
export async function lireAudit(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  clubEffectif: ClubId | null,
  filtres: AuditQuery,
): Promise<ResultatDal<PageStaff<LigneAuditLue>>> {
  let requete = supabase
    .from('coach_audit_logs')
    .select('id, actor_id, role, action, club_id, target_type, target_id, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(filtres.limit)

  if (clubEffectif) requete = requete.eq('club_id', clubEffectif)
  if (filtres.action) requete = requete.eq('action', filtres.action)
  if (filtres.actor_id) requete = requete.eq('actor_id', filtres.actor_id)
  if (filtres.target_type) requete = requete.eq('target_type', filtres.target_type)
  if (filtres.target_id) requete = requete.eq('target_id', filtres.target_id)
  if (filtres.from) requete = requete.gte('created_at', `${filtres.from}T00:00:00+00:00`)
  if (filtres.to) requete = requete.lte('created_at', `${filtres.to}T23:59:59+00:00`)
  if (filtres.cursor) requete = requete.lt('created_at', filtres.cursor)

  const { data, error } = await requete.returns<LigneAuditLue[]>()

  if (error) {
    console.error(`[${ctx.requestId}] lecture audit`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  const items = data ?? []
  const dernier = items.length === filtres.limit ? items[items.length - 1] : undefined
  return succes({ items, nextCursor: dernier ? dernier.created_at : null })
}

/**
 * Occupation agrégée d'un créneau — vue publique, lisible par `anon`.
 *
 * Elle ne rend qu'un COMPTE : jamais un `coach_id`, jamais un montant, jamais un
 * statut individuel. Rien qui permette de suivre une personne. C'est ce qui
 * permet d'afficher « complet / 1 place / libre » sur la grille publique sans
 * granter `coach_reservations` à `anon` — cahier : la grille publique est
 * « sans noms de coachs ».
 */
export async function occupationCreneaux(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  entree: { readonly clubId: ClubId; readonly du: string; readonly au: string },
): Promise<ResultatDal<{ club_id: string; space_id: string; starts_at: string; taken: number }[]>> {
  const { data, error } = await supabase
    .from('coach_slot_occupancy')
    .select('club_id, space_id, starts_at, taken')
    .eq('club_id', entree.clubId)
    .gte('starts_at', entree.du)
    .lte('starts_at', entree.au)
    .returns<{ club_id: string; space_id: string; starts_at: string; taken: number }[]>()

  if (error) {
    console.error(`[${ctx.requestId}] occupation créneaux`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }
  return succes(data ?? [])
}
