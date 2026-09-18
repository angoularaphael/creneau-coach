import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { CLUB_IDS, ROLES, type ClubId, type Role } from '@/domain/contrat'

import { clientServeur } from './serveur'

/**
 * Lecture de session — spec-04 §2.1 et §2.2.
 *
 * ═══ RÈGLE 1 : `getClaims()`, JAMAIS `getSession()` ═══
 * « *Never* trust `supabase.auth.getSession()` inside server code such as Proxy.
 *   It reads the session out of the cookie without revalidating it. […] Always
 *   use `supabase.auth.getClaims()` to protect pages and user data. »
 * `getSession()` rend ce que le cookie raconte. Un cookie est fourni par le
 * client : le croire, c'est laisser n'importe qui se déclarer `direction` en
 * éditant une valeur dans son navigateur. `getClaims()` VÉRIFIE LA SIGNATURE,
 * contre le JWKS du projet si les clés sont asymétriques, contre le serveur Auth
 * sinon.
 *
 * ═══ RÈGLE 2 : le rôle vient de `app_metadata`, JAMAIS de `user_metadata` ═══
 * « raw_user_meta_data — editable by users; unsafe for authorization.
 *   raw_app_meta_data — immutable; appropriate for authorization logic. »
 * `user_metadata` est modifiable par l'utilisateur lui-même via `updateUser()`.
 * Un rôle lu là-dedans, c'est une élévation de privilège en un appel d'API.
 *
 * ═══ RÈGLE 3 : ne pas confondre `claims.role` et notre rôle métier ═══
 * Le claim `role` d'un JWT Supabase vaut `authenticated` ou `anon` : c'est le
 * RÔLE POSTGRES, celui que la RLS utilise pour choisir ses policies. Nos quatre
 * rôles du cahier §1.1 (`coach`, `manager_salle`, `direction`, `service`) vivent
 * dans `app_metadata.role`. Le piège est d'autant plus facile que les deux
 * s'appellent « role ».
 *
 * ═══ RÈGLE 4 : un JWT ne dit pas si le compte est suspendu ═══
 * Un coach suspendu à 14h00 garde un jeton valide jusqu'à son expiration. Le
 * contrôle `SUSPENDED` se fait EN BASE (`coach_profiles.status`), dans la DAL et
 * dans les fonctions PL/pgSQL — jamais sur un claim. Voir `lib/dal/acteur.ts`.
 */

export type Acteur = {
  readonly id: string
  /** `app_metadata.role`. `null` = aucun rôle staff : les droits d'un coach ordinaire. */
  readonly role: Role | null
  /** `app_metadata.club_id` — n'a de sens que pour un `manager_salle`. */
  readonly clubId: ClubId | null
  readonly email: string | null
  /** Expiration du jeton, en secondes epoch. Utile pour journaliser, pas pour décider. */
  readonly expireLe: number
}

export type Session =
  | { readonly connecte: true; readonly acteur: Acteur }
  | { readonly connecte: false; readonly raison: 'anonyme' | 'jeton_invalide' }

function roleValide(valeur: unknown): Role | null {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur)
    ? (valeur as Role)
    : null
}

function clubValide(valeur: unknown): ClubId | null {
  return typeof valeur === 'string' && (CLUB_IDS as readonly string[]).includes(valeur)
    ? (valeur as ClubId)
    : null
}

/**
 * Lit et VÉRIFIE la session. Ne lève jamais : un jeton illisible est une absence
 * de session, pas une panne — l'appelant décide s'il répond 401 ou s'il sert une
 * page publique.
 */
export async function lireSession(client?: SupabaseClient): Promise<Session> {
  const supabase = client ?? (await clientServeur())

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    // On ne distingue pas « pas de cookie » de « cookie pourri » côté appelant :
    // les deux donnent 401. La distinction sert uniquement au journal.
    return { connecte: false, raison: error ? 'jeton_invalide' : 'anonyme' }
  }

  const claims = data.claims
  const meta = (claims.app_metadata ?? {}) as Record<string, unknown>

  return {
    connecte: true,
    acteur: {
      id: claims.sub,
      role: roleValide(meta.role),
      clubId: clubValide(meta.club_id),
      email: typeof claims.email === 'string' ? claims.email : null,
      expireLe: claims.exp,
    },
  }
}

export function estStaff(acteur: Acteur): boolean {
  return acteur.role === 'manager_salle' || acteur.role === 'direction'
}

export function estDirection(acteur: Acteur): boolean {
  return acteur.role === 'direction'
}
