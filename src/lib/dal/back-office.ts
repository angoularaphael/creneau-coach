import 'server-only'

import { cookies } from 'next/headers'

import { createServiceClient } from '@/lib/supabase/service'
import { COOKIE_BO, jetonValide } from '@/lib/admin/session'
import type { ClubId } from '@/domain/contrat'
import {
  doitRevoquerDeciplus,
  envoyerJobDeciplus,
  reservationVersJob,
} from '@/lib/bot/forward'

/**
 * Accès aux données du back-office.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE FICHIER LIT LA BASE AVEC `service_role`, QUI IGNORE TOUTE LA RLS.
 *
 * C'est pour ça que `garde()` s'exécute au début de CHAQUE fonction exportée, et
 * qu'elle vérifie la SIGNATURE du jeton, pas seulement sa présence. Le proxy ne
 * fait qu'un filtrage d'ergonomie : la documentation Next avertit qu'un changement
 * de `matcher`, ou une Server Function déplacée, retire sa couverture sans bruit.
 * La vraie frontière est ici.
 *
 * LIMITE CONNUE, À NE PAS OUBLIER : les comptes viennent de BOXPLUS (`app_users`),
 * mais la lecture métier passe encore par `service_role`. Qui entre voit les cinq
 * clubs. C'est acceptable pour la direction, ça ne l'est PAS pour un responsable
 * de salle tant que le périmètre club n'est pas dans la session.
 *
 * À faire avant d'ouvrir aux responsables de salle, et c'est bloquant :
 *   1. un compte Supabase par personne, rôle `manager_salle` | `direction` ;
 *   2. le périmètre club lu dans le JWT, JAMAIS dans l'URL — test contractuel §13.2
 *      (manager Minimes demandant `?club_id=portet` → 404) ;
 *   3. lecture via le client à session, pour que la RLS du cahier §12 s'applique ;
 *   4. suppression de ce fichier au profit de `src/lib/dal/staff.ts`, qui fait déjà
 *      tout ça correctement.
 * ────────────────────────────────────────────────────────────────────────────
 */
async function garde(): Promise<void> {
  const jeton = (await cookies()).get(COOKIE_BO)?.value
  if (!jetonValide(jeton)) {
    // Message identique dans tous les cas : ni « expiré », ni « signature fausse ».
    throw new Error('Back-office : accès refusé.')
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
  /**
   * Plus proche expiration parmi les holds vivants du créneau, ou `null`.
   * C'est la seule donnée de cette page qui vieillit pendant qu'on la regarde.
   */
  readonly hold_expire_le: string | null
}

export async function listerClubs(): Promise<Club[]> {
  await garde()
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
  await garde()
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
  /**
   * Le nom du coach — cahier §20 : « consulter le nom des coachs réservés ».
   *
   * La liste ne portait que `coach_id`, un UUID. Un responsable de salle qui
   * regarde son planning du samedi voulait savoir QUI vient ; il lisait
   * « 7f3a9c12-… ». L'exigence était au cahier depuis le début et la donnée
   * était en base : il manquait la jointure.
   *
   * `null` quand le profil a été effacé (droit à l'oubli) : la réservation
   * survit à la personne, et c'est voulu — la comptabilité en dépend.
   */
  readonly coach_nom: string | null
  readonly coach_statut: string | null
}

/**
 * Liste des réservations. Les colonnes sont choisies UNE PAR UNE, jamais `select *`.
 *
 * Le cahier §10 interdit au personnel de salle de voir le PDF de signature, le
 * jeton QR (`qr_jti`) et l'identifiant Deciplus. Un `select *` les ferait sortir
 * le jour où quelqu'un ajoute une colonne, sans que personne ne le remarque.
 */
export async function listerReservations(clubId: ClubId, du: string, au: string): Promise<ReservationBO[]> {
  await garde()
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, amount_cents, status, payment_status,' +
        ' signature_status, deciplus_job_status, hold_expires_at,' +
        // Jointure explicite, colonnes nommées une par une : le cahier §10
        // interdit au personnel de voir le PDF de signature, le jeton QR et
        // l'identifiant Deciplus. On ne ramène donc PAS tout le profil.
        ' coach_profiles!inner ( first_name, last_name, status )',
    )
    .eq('club_id', clubId)
    .gte('starts_at', du)
    .lte('starts_at', `${au}T23:59:59+02:00`)
    .order('starts_at')
    .limit(200)
  if (error) throw new Error(`réservations : ${error.message}`)

  type Brut = Omit<ReservationBO, 'coach_nom' | 'coach_statut'> & {
    coach_profiles: { first_name: string | null; last_name: string | null; status: string } | null
  }

  return (data ?? []).map((r) => {
    const { coach_profiles: p, ...reste } = r as unknown as Brut
    const nom = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim()
    return {
      ...reste,
      // Un profil sans prénom ni nom existe : l'inscription les collecte, mais
      // rien n'empêche une ligne créée autrement. On ne veut pas d'une case
      // vide muette — on dit que le nom manque.
      coach_nom: nom || null,
      coach_statut: p?.status ?? null,
    }
  })
}

/** Bloque un créneau — cahier §10, `POST /admin/slot-blocks`. */
export async function bloquerCreneau(
  clubId: ClubId,
  spaceId: string,
  startsAt: string,
  raison = 'educative',
): Promise<void> {
  await garde()
  const sb = createServiceClient()
  const { error } = await sb
    .from('coach_slot_blocks')
    .insert({ club_id: clubId, space_id: spaceId, starts_at: startsAt, reason: raison })
  if (error && error.code !== '23505') throw new Error(`blocage : ${error.message}`)
}

export async function debloquerCreneau(clubId: ClubId, spaceId: string, startsAt: string): Promise<void> {
  await garde()
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
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, code: 'FORBIDDEN', message: 'Indisponible en production.' }
  }
  await garde()
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
  await garde()
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
  await garde()
  const sb = createServiceClient()
  const { data } = await sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, ends_at, qr_valid_from, qr_valid_to, deciplus_job_status',
    )
    .eq('id', id)
    .maybeSingle()
  if (data && doitRevoquerDeciplus(String(data.deciplus_job_status))) {
    await envoyerJobDeciplus(reservationVersJob(data as Record<string, unknown>, 'coach_revoke')).catch(
      (e) => {
        console.warn('[deciplus] enqueue revoke BO', e instanceof Error ? e.message : e)
      },
    )
  }
  const { error } = await sb.from('coach_reservations').delete().eq('id', id)
  if (error) throw new Error(`suppression : ${error.message}`)
}
