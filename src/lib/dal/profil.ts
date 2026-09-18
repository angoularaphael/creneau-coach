import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { erreur } from '@/lib/http/erreurs'
import type { ContexteRequete } from '@/lib/security/request-context'
import type { ProfilePatchBody } from '@/lib/security/schemas/profile'

import { echec, succes, type ActeurCourant, type ResultatDal } from './acteur'

/**
 * Profil du coach — cahier §5, `GET /me` et `PATCH /me`.
 */

/**
 * Colonnes rendues au coach.
 *
 * ABSENTES ET NON GRANTÉES EN BASE : `deciplus_member_id`, `payplug_customer_id`,
 * `paypal_vault_id`. Le cahier §9 est catégorique sur le premier. Les deux
 * autres sont des jetons de paiement : on ne les voit jamais, y compris nous.
 */
const COLONNES_PROFIL = [
  'id',
  'first_name',
  'last_name',
  'birth_date',
  'phone',
  'email',
  'address_line',
  'postal_code',
  'city',
  'diploma',
  'disciplines',
  'status',
  'suspended_at',
  'suspended_reason',
  'consent_privacy_at',
  'consent_cgu_at',
  'created_at',
  'updated_at',
].join(', ')
// `photo_path` est granté en base mais volontairement absent ici : c'est un
// chemin dans un bucket PRIVÉ. Le rendre au navigateur n'a d'intérêt que si on
// sert l'image, et on la sert alors par URL signée à durée courte — pas en
// laissant fuiter le chemin brut, qui devient une capacité si le bucket est un
// jour mal configuré.

export type Profil = {
  id: string
  first_name: string | null
  last_name: string | null
  birth_date: string | null
  phone: string | null
  email: string | null
  address_line: string | null
  postal_code: string | null
  city: string | null
  diploma: string | null
  disciplines: string[]
  status: 'active' | 'suspended' | 'deleted'
  suspended_at: string | null
  suspended_reason: string | null
  consent_privacy_at: string | null
  consent_cgu_at: string | null
  created_at: string
  updated_at: string
}

export async function lireMonProfil(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  acteur: ActeurCourant,
): Promise<ResultatDal<Profil>> {
  const { data, error } = await supabase
    .from('coach_profiles')
    .select(COLONNES_PROFIL)
    // `.eq('id', …)` est redondant avec la policy `coach_profiles_lecture_soi`
    // POUR UN COACH — mais pas pour une direction, qui voit tous les profils.
    // Sans ce filtre, `GET /me` d'une direction rendrait une ligne arbitraire.
    .eq('id', acteur.id)
    .maybeSingle<Profil>()

  if (error) {
    console.error(`[${ctx.requestId}] lecture profil`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }
  if (!data) return echec(erreur('NOT_FOUND', {}))

  return succes(data)
}

/**
 * `PATCH /me`.
 *
 * Les champs interdits ne sont pas filtrés ici : ils sont REFUSÉS EN AMONT par
 * `ProfilePatchBody` (`strictObject`), et refusés une seconde fois par Postgres,
 * qui ne grante l'UPDATE que sur neuf colonnes d'identité. `status`,
 * `suspended_at`, `deciplus_member_id` et les jetons de paiement sont donc
 * inécrivables par trois chemins indépendants. C'est voulu : un seul mur finit
 * toujours par être contourné par quelqu'un qui « avait besoin » d'ajouter un
 * champ.
 */
export async function majMonProfil(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  acteur: ActeurCourant,
  patch: ProfilePatchBody,
): Promise<ResultatDal<Profil>> {
  if (Object.keys(patch).length === 0) {
    return echec(erreur('VALIDATION_ERROR', { issues: [{ path: '(racine)', code: 'empty' }] }))
  }

  const { data, error } = await supabase
    .from('coach_profiles')
    .update(patch)
    .eq('id', acteur.id)
    .select(COLONNES_PROFIL)
    .maybeSingle<Profil>()

  if (error) {
    console.error(`[${ctx.requestId}] mise à jour profil`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }
  if (!data) return echec(erreur('NOT_FOUND', {}))

  return succes(data)
}

/** Solde d'avoirs disponible, en centimes — cahier §3.6, lot A en dépend. */
export async function soldeAvoirs(
  ctx: ContexteRequete,
  supabase: SupabaseClient,
  acteur: ActeurCourant,
): Promise<ResultatDal<number>> {
  const { data, error } = await supabase
    .from('coach_credits')
    .select('amount_cents')
    .eq('coach_id', acteur.id)
    .eq('status', 'available')
    .returns<{ amount_cents: number }[]>()

  if (error) {
    console.error(`[${ctx.requestId}] lecture avoirs`, { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  // `amount_cents` est LE RESTE disponible, pas le montant d'origine (cahier
  // §3.6). Sommer `initial_amount_cents` rendrait un solde faux à la hausse.
  return succes((data ?? []).reduce((total, ligne) => total + ligne.amount_cents, 0))
}
