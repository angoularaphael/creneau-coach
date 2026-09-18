import 'server-only'

import { after } from 'next/server'

import type { Role } from '@/domain/contrat'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Journal d'audit — spec-04 §10, cahier §3.8.
 *
 * ═══ LA CONTRAINTE QUI DÉTERMINE TOUT LE RESTE ═══
 * `coach_audit_logs` est LISIBLE PAR UN MANAGER DE SALLE sur son club (cahier
 * §12). Ce n'est donc pas un journal serveur privé : c'est une surface exposée.
 * Tout ce que le cahier interdit de montrer à un manager — `deciplus_member_id`
 * en tête (cahier §9 et §11) — est interdit dans `meta`, sans quoi on le lui
 * servirait par la porte de derrière.
 *
 * ═══ LISTE BLANCHE, PAS LISTE NOIRE ═══
 * Une liste noire laisse passer le champ qu'on ajoutera demain. Une liste
 * blanche le bloque par défaut. C'est le seul sens qui tienne dans le temps :
 * la vraie fuite ne vient jamais d'un `meta: { password }` écrit exprès, elle
 * vient d'un `meta: { ...body }` ou d'un `meta: { headers }` ajouté un soir
 * « juste pour déboguer » et jamais retiré.
 *
 * ═══ CE QUI N'ENTRE JAMAIS ═══
 * PAN / CVV / IBAN · token QR `v1.<payload>.<hmac>` · tout secret d'environnement ·
 * `deciplus_member_id` · mot de passe, JWT, refresh token · la VALEUR d'une
 * `Idempotency-Key` (on stocke `key_fp`) · l'image de signature et le chemin du
 * PDF signé · e-mail, téléphone, adresse, date de naissance en clair
 * (`actor_id` suffit, et dupliquer la PII rendrait `DELETE /me` inhonorable) ·
 * l'IP en clair (on pose `ip_hash` ; l'IP réelle ne vit que dans
 * `coach_signatures`, où le cahier §3.7 en fait une preuve légale) ·
 * le corps de requête, même « juste pour cette route ».
 */

const META_AUTORISEE = new Set([
  'request_id',
  'route',
  'ip_hash',
  'email_hash',
  'attempt_no',
  'dimension',
  'limit',
  'window_s',
  'retry_after_s',
  'endpoint',
  'key_fp',
  'reason',
  'replayed_status',
  'service',
  'signed',
  'requested_club_id',
  'actor_club_id',
  'target_type',
  'target_id',
  'issue_paths',
  'origin',
  'from',
  'to',
  'status',
  'space_id',
  'method',
])

const LONGUEUR_MAX_VALEUR = 500
const ELEMENTS_MAX_TABLEAU = 20

/**
 * Projette un `meta` arbitraire sur les seules clés autorisées.
 *
 * Les objets imbriqués sont REFUSÉS EN BLOC : c'est par là qu'un secret se
 * faufile (`meta: { contexte: { env } }` passerait une liste blanche appliquée
 * au premier niveau seulement). Les tableaux sont acceptés parce que
 * `issue_paths` en est un, mais bornés et aplatis en chaînes.
 */
export function safeMeta(entree: Record<string, unknown>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {}

  for (const [cle, valeur] of Object.entries(entree)) {
    if (!META_AUTORISEE.has(cle)) continue
    if (valeur === null || valeur === undefined) continue

    if (Array.isArray(valeur)) {
      sortie[cle] = valeur
        .slice(0, ELEMENTS_MAX_TABLEAU)
        .filter((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        .map((v) => (typeof v === 'string' ? v.slice(0, LONGUEUR_MAX_VALEUR) : v))
      continue
    }

    if (typeof valeur === 'object') continue // objet imbriqué : refusé, sans exception.
    if (typeof valeur === 'function' || typeof valeur === 'symbol') continue
    if (typeof valeur === 'bigint') {
      sortie[cle] = valeur.toString()
      continue
    }

    sortie[cle] = typeof valeur === 'string' ? valeur.slice(0, LONGUEUR_MAX_VALEUR) : valeur
  }

  return sortie
}

/** `anonymous` n'est pas un rôle du cahier §1.1 : c'est l'absence de rôle, nommée. */
export type RoleAudit = Role | 'anonymous'

export type LigneAudit = {
  readonly actorId: string | null
  readonly role: RoleAudit
  readonly action: string
  readonly clubId?: string | null
  readonly targetType?: string | null
  readonly targetId?: string | null
  readonly meta?: Record<string, unknown>
}

async function ecrire(ligne: LigneAudit): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('coach_audit_logs').insert({
      actor_id: ligne.actorId,
      role: ligne.role,
      action: ligne.action,
      club_id: ligne.clubId ?? null,
      target_type: ligne.targetType ?? null,
      target_id: ligne.targetId ?? null,
      meta: safeMeta(ligne.meta ?? {}),
    })
    if (error) {
      console.error('[audit] échec écriture', { action: ligne.action, code: error.code })
    }
  } catch (e) {
    // Un journal qui fait tomber la requête qu'il journalise est pire que pas de
    // journal du tout. On crie dans les logs Vercel et on continue.
    console.error('[audit] exception', { action: ligne.action, e })
  }
}

/**
 * Chemin de REFUS (401 / 403 / 404 / 409 / 429) : écriture SYNCHRONE, avant de
 * répondre. Perdre la trace d'un refus, c'est perdre la seule chose qui compte —
 * et c'est précisément ce que ferait un `after()` sur une fonction serverless
 * tuée juste après avoir renvoyé son 403.
 */
export function auditDeny(ligne: LigneAudit): Promise<void> {
  return ecrire(ligne)
}

/**
 * Chemin de SUCCÈS : après la réponse, pour ne pas ajouter de latence au chemin
 * heureux. `after` est stable depuis Next 15.1 et s'exécute même si la réponse a
 * échoué, ou après `notFound()` / `redirect()`.
 *
 * Hors contexte de requête (test, script, tâche de fond), `after` lève. On
 * retombe alors sur une écriture directe : le journal reste complet.
 */
export function auditOk(ligne: LigneAudit): void {
  try {
    after(async () => {
      await ecrire(ligne)
    })
  } catch {
    void ecrire(ligne)
  }
}

/**
 * spec-04 §10.1 — LA ligne la plus importante de ce fichier.
 *
 * L'API répond 404 pour ne pas confirmer l'existence d'une ressource (cahier
 * §1.3 : « un coach B qui demande la résa de A reçoit 404, jamais 403 »). Côté
 * API, « je me suis trompé d'URL » et « je sonde systématiquement Portet » sont
 * donc RIGOUREUSEMENT IDENTIQUES. Sans cette ligne d'audit, la sonde est
 * invisible. C'est ici, et seulement ici, qu'on garde la vraie raison du refus.
 */
export function auditRefusAutorisation(entree: {
  readonly actorId: string | null
  readonly role: RoleAudit
  readonly route: string
  readonly requestId: string
  readonly requestedClubId?: string | null
  readonly actorClubId?: string | null
  readonly targetType?: string | null
  readonly targetId?: string | null
  readonly reason: string
}): Promise<void> {
  return auditDeny({
    actorId: entree.actorId,
    role: entree.role,
    action: 'authz.denied',
    clubId: entree.requestedClubId ?? null,
    targetType: entree.targetType ?? null,
    targetId: entree.targetId ?? null,
    meta: {
      route: entree.route,
      request_id: entree.requestId,
      requested_club_id: entree.requestedClubId,
      actor_club_id: entree.actorClubId,
      reason: entree.reason,
    },
  })
}
