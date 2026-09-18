import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ClubId, Role } from '@/domain/contrat'
import { erreur, horsPerimetre, type ErreurMetier } from '@/lib/http/erreurs'
import { auditRefusAutorisation, type RoleAudit } from '@/lib/security/audit'
import type { ContexteRequete } from '@/lib/security/request-context'
import { clientServeur } from '@/lib/supabase/serveur'
import { lireSession, type Acteur } from '@/lib/supabase/session'

/**
 * Le cœur de la DAL — spec-04 §2, cahier §1.1, §1.3, §12, tests §13.1 et §13.2.
 *
 * ═══ POURQUOI UNE DAL, ET PAS DES CONTRÔLES DANS LES ROUTES ═══
 * « Beyond authentication (is the user logged in?), remember to check
 *   authorization (does this user have permission to act on this specific
 *   resource?). This prevents Insecure Direct Object Reference (IDOR). »
 * Un contrôle recopié dans quinze routes est faux dans la seizième. Ici il n'y a
 * qu'un endroit où l'on décide, et il est testable seul.
 *
 * ═══ QUATRE RÈGLES QUE CE FICHIER FAIT RESPECTER ═══
 *
 * 1. LE JWT NE DIT PAS SI LE COMPTE EST SUSPENDU. Un coach suspendu à 14h00
 *    garde un jeton valide jusqu'à expiration — une heure par défaut chez
 *    Supabase. Si `SUSPENDED` se vérifiait sur un claim, il pourrait encore
 *    réserver à 14h55. Le contrôle lit `coach_profiles.status` EN BASE.
 *
 * 2. 404, JAMAIS 403, SUR UNE RESSOURCE HORS PÉRIMÈTRE. Cahier §1.3 : « un coach
 *    B qui demande la résa de A reçoit 404 NOT_FOUND, jamais 403 ». Un 403
 *    confirme l'existence : il transforme une URL devinée en oracle
 *    d'énumération. Hors périmètre et inexistant doivent être indiscernables.
 *
 * 3. MAIS LE JOURNAL, LUI, SAIT. Côté API « je me suis trompé d'URL » et « je
 *    sonde systématiquement Portet » sont identiques. `authz.denied` est la seule
 *    trace qui les distingue. Sans elle, la sonde est invisible.
 *
 * 4. LA RLS EST LE SECOND MUR, PAS LE PREMIER — ET RÉCIPROQUEMENT. Les lectures
 *    passent par le client PORTEUR DE SESSION, jamais par `service_role` : même
 *    si ce fichier se trompait, Postgres refuserait. Deux murs indépendants.
 */

export type ActeurCourant = Acteur & {
  /** Lu EN BASE, pas dans le jeton. Voir règle 1. */
  readonly statut: 'active' | 'suspended' | 'deleted'
  readonly supprime: boolean
}

export type ResultatDal<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly erreur: ErreurMetier }

export function succes<T>(valeur: T): ResultatDal<T> {
  return { ok: true, valeur }
}

export function echec<T = never>(e: ErreurMetier): ResultatDal<T> {
  return { ok: false, erreur: e }
}

function roleAudit(role: Role | null): RoleAudit {
  return role ?? 'anonymous'
}

export type SessionDal = {
  readonly acteur: ActeurCourant
  /** Client PORTEUR DE SESSION : toute lecture passe sous RLS. */
  readonly supabase: SupabaseClient
}

/**
 * Authentifie, puis lit le statut en base.
 *
 * `lectureSeule: true` saute la lecture de profil pour les GET qui n'ont besoin
 * que de l'identité (la RLS filtre déjà les lignes) : un aller-retour Postgres
 * de moins sur le chemin le plus fréquent. Le contrôle `SUSPENDED` reste
 * obligatoire sur toute ÉCRITURE — cahier §1.1 : « suspendu → 403 sur tout write ».
 */
export async function exigerSession(
  ctx: ContexteRequete,
  options: { readonly lectureSeule?: boolean } = {},
): Promise<ResultatDal<SessionDal>> {
  const supabase = await clientServeur()
  const session = await lireSession(supabase)

  if (!session.connecte) {
    return echec(erreur('UNAUTHENTICATED', {}))
  }

  const base = session.acteur

  if (options.lectureSeule) {
    return succes({
      acteur: { ...base, statut: 'active', supprime: false },
      supabase,
    })
  }

  const { data, error } = await supabase
    .from('coach_profiles')
    .select('status, suspended_at')
    .eq('id', base.id)
    .maybeSingle<{ status: 'active' | 'suspended' | 'deleted'; suspended_at: string | null }>()

  if (error) {
    console.error('[dal] lecture de profil impossible', { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }

  if (!data) {
    // Jeton valide mais aucun profil : compte supprimé (RGPD) ou jamais
    // provisionné. On ne dit pas lequel — c'est le même 401 pour les deux.
    await auditRefusAutorisation({
      actorId: base.id,
      role: roleAudit(base.role),
      route: ctx.route,
      requestId: ctx.requestId,
      reason: 'profil_absent',
    })
    return echec(erreur('UNAUTHENTICATED', {}))
  }

  if (data.status === 'suspended') {
    await auditRefusAutorisation({
      actorId: base.id,
      role: roleAudit(base.role),
      route: ctx.route,
      requestId: ctx.requestId,
      reason: 'compte_suspendu',
    })
    // Ici on répond bien 403 SUSPENDED et non 404 : le coach connaît son propre
    // compte, il n'y a rien à énumérer, et le cahier §1.1 impose ce code exact.
    return echec(erreur('SUSPENDED', {}))
  }

  return succes({
    acteur: { ...base, statut: data.status, supprime: data.status === 'deleted' },
    supabase,
  })
}

/** Staff = `manager_salle` ou `direction`. Cahier §12. */
export async function exigerStaff(ctx: ContexteRequete): Promise<ResultatDal<SessionDal>> {
  const r = await exigerSession(ctx)
  if (!r.ok) return r

  const { acteur } = r.valeur
  if (acteur.role !== 'manager_salle' && acteur.role !== 'direction') {
    await auditRefusAutorisation({
      actorId: acteur.id,
      role: roleAudit(acteur.role),
      route: ctx.route,
      requestId: ctx.requestId,
      actorClubId: acteur.clubId,
      reason: 'role_insuffisant_staff',
    })
    // 404 : l'existence même du back-office n'a pas à être confirmée à un coach.
    return echec(horsPerimetre())
  }
  return r
}

/** Direction seule : réglages, tarifs, suspension, avoirs (cahier §10). */
export async function exigerDirection(ctx: ContexteRequete): Promise<ResultatDal<SessionDal>> {
  const r = await exigerSession(ctx)
  if (!r.ok) return r

  const { acteur } = r.valeur
  if (acteur.role !== 'direction') {
    await auditRefusAutorisation({
      actorId: acteur.id,
      role: roleAudit(acteur.role),
      route: ctx.route,
      requestId: ctx.requestId,
      actorClubId: acteur.clubId,
      reason: 'role_insuffisant_direction',
    })
    return echec(horsPerimetre())
  }
  return r
}

/**
 * Périmètre club — test contractuel §13.2 : « manager Minimes avec
 * `?club_id=portet` → 404 ».
 *
 * Rend le club EFFECTIF de la requête :
 *   · direction      → le club demandé, ou `null` (= les cinq clubs) ;
 *   · manager_salle  → SON club, toujours. Demander un autre club est un refus,
 *                      et ne rien demander veut dire « le mien », pas « tous ».
 *
 * Ce n'est pas un filtre de confort : sans lui, `?club_id=` absent ferait passer
 * un manager pour une direction dans une requête qui ne filtre rien.
 */
export async function perimetreClub(
  ctx: ContexteRequete,
  acteur: ActeurCourant,
  clubDemande: ClubId | null | undefined,
): Promise<ResultatDal<ClubId | null>> {
  if (acteur.role === 'direction') {
    return succes(clubDemande ?? null)
  }

  if (acteur.role === 'manager_salle') {
    if (!acteur.clubId) {
      // Un manager sans `app_metadata.club_id` est un compte mal provisionné.
      // On ferme : « pas de club » ne doit jamais valoir « tous les clubs ».
      await auditRefusAutorisation({
        actorId: acteur.id,
        role: roleAudit(acteur.role),
        route: ctx.route,
        requestId: ctx.requestId,
        requestedClubId: clubDemande ?? null,
        reason: 'manager_sans_club',
      })
      return echec(horsPerimetre())
    }

    if (clubDemande && clubDemande !== acteur.clubId) {
      await auditRefusAutorisation({
        actorId: acteur.id,
        role: roleAudit(acteur.role),
        route: ctx.route,
        requestId: ctx.requestId,
        requestedClubId: clubDemande,
        actorClubId: acteur.clubId,
        reason: 'club_hors_perimetre',
      })
      return echec(horsPerimetre())
    }

    return succes(acteur.clubId)
  }

  await auditRefusAutorisation({
    actorId: acteur.id,
    role: roleAudit(acteur.role),
    route: ctx.route,
    requestId: ctx.requestId,
    requestedClubId: clubDemande ?? null,
    reason: 'role_sans_perimetre_club',
  })
  return echec(horsPerimetre())
}

/**
 * Refus d'accès à une ressource nommée. Répond 404, journalise la vraie raison.
 * À appeler partout où un identifiant devinable est en jeu, pour qu'un relecteur
 * voie l'intention plutôt qu'un `erreur('NOT_FOUND')` anonyme.
 */
export async function refuserRessource(
  ctx: ContexteRequete,
  acteur: ActeurCourant | null,
  cible: { readonly type: string; readonly id: string; readonly raison: string },
): Promise<ErreurMetier> {
  await auditRefusAutorisation({
    actorId: acteur?.id ?? null,
    role: roleAudit(acteur?.role ?? null),
    route: ctx.route,
    requestId: ctx.requestId,
    actorClubId: acteur?.clubId ?? null,
    targetType: cible.type,
    targetId: cible.id,
    reason: cible.raison,
  })
  return horsPerimetre()
}
