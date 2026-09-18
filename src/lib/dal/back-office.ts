import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import type { ClubId } from '@/domain/contrat'

/**
 * Accès aux données du back-office — VERSION DE DÉVELOPPEMENT, SANS AUTHENTIFICATION.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE FICHIER PARLE À LA BASE AVEC `service_role`, QUI IGNORE TOUTE LA RLS.
 *
 * Il n'existe que pour éprouver le moteur (grille, capacités, blocages, holds)
 * pendant le développement, avant que l'authentification staff soit branchée.
 *
 * D'où le garde-fou ci-dessous : en production, ce module refuse de répondre.
 * Le pire scénario d'un déploiement accidentel est donc une page en erreur,
 * jamais un back-office ouvert sur les données de vrais coachs.
 *
 * À FAIRE AVANT LA MISE EN LIGNE, et c'est bloquant :
 *   1. lire la session staff (`manager_salle` | `direction`) ;
 *   2. passer par le client à session, pour que la RLS du cahier §12 s'applique ;
 *   3. forcer le périmètre club du manager depuis son JWT, jamais depuis l'URL —
 *      c'est le test contractuel §13.2 (manager Minimes demandant Portet → 404) ;
 *   4. remettre '/admin' dans `SURFACES_PRIVEES` de `src/proxy.ts` ;
 *   5. supprimer ce fichier au profit de `src/lib/dal/staff.ts`, qui fait déjà
 *      tout ça correctement.
 * ────────────────────────────────────────────────────────────────────────────
 */
function garde(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "Back-office de développement : indisponible en production. L'authentification " +
        "staff (manager_salle | direction) doit être branchée avant toute mise en ligne.",
    )
  }
}

export type Club = {
  readonly id: ClubId
  readonly name: string
  readonly spaces: { readonly id: string; readonly name: string; readonly capacity: number }[]
}

export type Creneau = {
  readonly club_id: string
  readonly space_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly amount_cents: number
  readonly tariff: 'offpeak' | 'peak'
  readonly capacity: number
  readonly taken: number
  readonly state: 'open' | 'full' | 'blocked' | 'past'
}

export async function listerClubs(): Promise<Club[]> {
  garde()
  const sb = createServiceClient()

  const [{ data: clubs, error: e1 }, { data: espaces, error: e2 }] = await Promise.all([
    sb.from('coach_clubs').select('id, name').order('name'),
    sb.from('coach_spaces').select('id, club_id, name, capacity').eq('is_active', true).order('id'),
  ])
  if (e1) throw new Error(`clubs : ${e1.message}`)
  if (e2) throw new Error(`espaces : ${e2.message}`)

  return (clubs ?? []).map((c) => ({
    id: c.id as ClubId,
    name: c.name as string,
    spaces: (espaces ?? [])
      .filter((s) => s.club_id === c.id)
      .map((s) => ({ id: s.id as string, name: s.name as string, capacity: s.capacity as number })),
  }))
}

/**
 * La grille vient de `coach_slot_grid`, la MÊME fonction SQL que celle qui sert
 * `GET /clubs/:id/slots`. Le back-office et le coach ne peuvent donc pas voir
 * deux plannings différents — c'était le risque d'une seconde implémentation.
 */
export async function lireGrille(
  clubId: ClubId,
  spaceId: string | null,
  du: string,
  au: string,
): Promise<Creneau[]> {
  garde()
  const sb = createServiceClient()
  const { data, error } = await sb.rpc('coach_slot_grid', {
    p_club_id: clubId,
    p_space_id: spaceId,
    p_from: du,
    p_to: au,
  })
  if (error) throw new Error(`grille : ${error.message}`)
  return (data ?? []) as Creneau[]
}

export type ReservationBO = {
  readonly id: string
  readonly coach_id: string
  readonly club_id: string
  readonly space_id: string
  readonly starts_at: string
  readonly amount_cents: number
  readonly status: string
  readonly payment_status: string
  readonly signature_status: string
  readonly deciplus_job_status: string
  readonly hold_expires_at: string | null
}

/**
 * Liste des réservations. Les colonnes sont choisies UNE PAR UNE, jamais `select *`.
 *
 * Le cahier §10 interdit au personnel de salle de voir le PDF de signature, le
 * jeton QR (`qr_jti`) et l'identifiant Deciplus. Un `select *` les ferait sortir
 * le jour où quelqu'un ajoute une colonne, sans que personne ne le remarque.
 */
export async function listerReservations(clubId: ClubId, du: string, au: string): Promise<ReservationBO[]> {
  garde()
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, amount_cents, status, payment_status, signature_status, deciplus_job_status, hold_expires_at',
    )
    .eq('club_id', clubId)
    .gte('starts_at', du)
    .lte('starts_at', `${au}T23:59:59+02:00`)
    .order('starts_at')
    .limit(200)
  if (error) throw new Error(`réservations : ${error.message}`)
  return (data ?? []) as ReservationBO[]
}

/** Bloque un créneau — cahier §10, `POST /admin/slot-blocks`. */
export async function bloquerCreneau(
  clubId: ClubId,
  spaceId: string,
  startsAt: string,
  raison = 'educative',
): Promise<void> {
  garde()
  const sb = createServiceClient()
  const { error } = await sb
    .from('coach_slot_blocks')
    .insert({ club_id: clubId, space_id: spaceId, starts_at: startsAt, reason: raison })
  if (error && error.code !== '23505') throw new Error(`blocage : ${error.message}`)
}

export async function debloquerCreneau(clubId: ClubId, spaceId: string, startsAt: string): Promise<void> {
  garde()
  const sb = createServiceClient()
  const { error } = await sb
    .from('coach_slot_blocks')
    .delete()
    .eq('club_id', clubId)
    .eq('space_id', spaceId)
    .eq('starts_at', startsAt)
  if (error) throw new Error(`déblocage : ${error.message}`)
}

/**
 * Pose un hold au nom d'un coach de test, en passant par `coach_create_hold` —
 * la vraie fonction du moteur, avec son verrou consultatif, son attribution de
 * siège, sa limite de 3 actives et son prix serveur.
 *
 * On ne simule rien : c'est le chemin que prendra un vrai coach. C'est ce qui
 * rend ce bouton utile pour voir la capacité et les blocages se comporter.
 */
export async function poserHoldDeTest(
  coachId: string,
  clubId: ClubId,
  spaceId: string,
  startsAt: string,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  garde()
  const sb = createServiceClient()
  const { data, error } = await sb.rpc('coach_create_hold_as', {
    p_coach_id: coachId,
    p_club_id: clubId,
    p_space_id: spaceId,
    p_starts_at: startsAt,
    p_idempotency_key: crypto.randomUUID(),
  })
  if (error) return { ok: false, code: 'CONFLICT', message: error.message }
  const r = data as { ok: boolean; error?: { code: string; message: string } }
  return r.ok ? { ok: true } : { ok: false, code: r.error?.code, message: r.error?.message }
}

/** Les coachs de test disponibles pour poser des holds depuis le back-office. */
export async function listerCoachsDeTest(): Promise<{ id: string; nom: string; status: string }[]> {
  garde()
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coach_profiles')
    .select('id, first_name, last_name, status')
    .order('created_at')
    .limit(20)
  if (error) throw new Error(`coachs : ${error.message}`)
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nom: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || (c.id as string).slice(0, 8),
    status: c.status as string,
  }))
}

export async function annulerReservation(id: string): Promise<void> {
  garde()
  const sb = createServiceClient()
  const { error } = await sb.from('coach_reservations').delete().eq('id', id)
  if (error) throw new Error(`suppression : ${error.message}`)
}
