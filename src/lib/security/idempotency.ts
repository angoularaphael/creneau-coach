import 'server-only'

import { z } from 'zod'

import { MESSAGES_ERREUR } from '@/domain/contrat'
import { createServiceClient } from '@/lib/supabase/service'

import { empreinte, hashCorpsBrut } from './crypto'

/**
 * Idempotence — spec-04 §4, cahier §1.2 et test contractuel §13.13.
 *
 * ═══ LE PIÈGE DE SÉCURITÉ QUE LE CAHIER NE NOMME PAS ═══
 * Si la clé était l'unique identifiant du cache, le coach B qui devine ou
 * intercepte la clé du coach A relirait LA RÉPONSE DE A — une réservation
 * entière qui ne lui appartient pas. C'est un IDOR complet, et il contourne le
 * 404 anti-énumération du §1.3 par un chemin que personne ne regarde.
 * → LA CLÉ PRIMAIRE EST `(key, coach_id, endpoint)`. Une clé rejouée par un
 *   autre coach n'est pas un rejeu : c'est une requête neuve pour ce coach-là.
 *
 * ═══ CE MODULE NE SERT PAS À `POST /reservations` ═══
 * Pour le hold, la réservation de clé et la création du hold doivent tenir dans
 * UNE SEULE TRANSACTION (spec-04 §4.5) : sinon le hold est créé, la fonction
 * meurt, la clé reste `in_flight`, le coach rejoue, et au bout du bail il obtient
 * un SECOND hold — exactement ce que le test §13.13 interdit. PostgREST ne donne
 * pas de transaction multi-instruction, donc l'idempotence du hold vit DANS
 * `coach_create_hold` (migration 0010), pas ici.
 *
 * Ce module couvre les endpoints idempotents qui ne sont PAS adossés à une
 * fonction PL/pgSQL — `POST /reservations/{id}/checkout` en premier, qui appelle
 * un prestataire externe et ne peut donc pas vivre dans une transaction Postgres.
 *
 * ═══ LE BAIL ═══
 * Une fonction Vercel peut être tuée entre la réservation de la clé et la
 * clôture. Sans bail, la clé reste `in_flight` POUR TOUJOURS et le coach ne peut
 * plus jamais réserver avec elle. Avec bail (60 s), la requête suivante reprend
 * la main par comparaison-et-échange optimiste.
 */

const DUREE_BAIL_MS = 60_000

/** Cahier §1.2 : la clé est un UUID v4. La base la stocke en `uuid`, pas en `text`. */
const CleIdempotence = z.uuid({ version: 'v4' })

export function lireCleIdempotence(req: Request): string | null {
  const brut = req.headers.get('idempotency-key')?.trim()
  if (!brut) return null
  const r = CleIdempotence.safeParse(brut)
  return r.success ? r.data : null
}

/** `key_fp` — ce qu'on journalise. Jamais la clé : pendant 24 h, elle rend une réponse. */
export function empreinteCle(cle: string): string {
  return empreinte(cle, 16)
}

export type ContexteIdempotence = {
  readonly cle: string
  readonly coachId: string
  /** Ex. `POST /reservations/:id/checkout`. Fait partie de la clé primaire. */
  readonly endpoint: string
  /** `sha256` du corps BRUT — spec-04 §4.4. Jamais `JSON.stringify(body)`. */
  readonly requestHash: string
}

export function contexteIdempotence(entree: {
  readonly cle: string
  readonly coachId: string
  readonly endpoint: string
  readonly corpsBrut: string
}): ContexteIdempotence {
  return {
    cle: entree.cle,
    coachId: entree.coachId,
    endpoint: entree.endpoint,
    requestHash: hashCorpsBrut(entree.corpsBrut),
  }
}

export type VerdictIdempotence =
  /** On possède le bail : exécuter, puis appeler `terminerIdempotence` ou `libererIdempotence`. */
  | { readonly etat: 'acquis' }
  /** Réponse déjà mémorisée : la resservir À L'IDENTIQUE. */
  | { readonly etat: 'rejeu'; readonly status: number; readonly body: unknown }
  /** Une requête jumelle est en vol, bail encore valide. */
  | { readonly etat: 'en_vol' }
  /** Même clé, même coach, même endpoint, mais un CORPS DIFFÉRENT. */
  | { readonly etat: 'conflit_corps' }
  /** La base n'a pas répondu. L'appelant décide (§3.6). */
  | { readonly etat: 'indisponible'; readonly code: string | null }

type LigneIdem = {
  request_hash: string
  state: 'in_flight' | 'completed'
  response_status: number | null
  response_body: unknown
  lease_until: string
}

/**
 * RÉSERVER D'ABORD, travailler ensuite.
 *
 * Le rejeu dangereux n'est pas celui d'après la réponse, c'est le rejeu EN VOL :
 * double-clic, retry réseau. Un « SELECT puis INSERT si absent » les laisse
 * passer tous les deux et produit deux effets. On pose donc la ligne avant tout
 * travail, et c'est l'unicité de la clé primaire qui tranche.
 */
export async function debuterIdempotence(ctx: ContexteIdempotence): Promise<VerdictIdempotence> {
  const supabase = createServiceClient()
  const maintenant = new Date()

  const { data: pose, error: erreurPose } = await supabase
    .from('coach_idempotency_keys')
    .upsert(
      {
        key: ctx.cle,
        coach_id: ctx.coachId,
        endpoint: ctx.endpoint,
        request_hash: ctx.requestHash,
        state: 'in_flight',
        lease_until: new Date(maintenant.getTime() + DUREE_BAIL_MS).toISOString(),
      },
      { onConflict: 'key,coach_id,endpoint', ignoreDuplicates: true },
    )
    .select('key')

  if (erreurPose) {
    console.error('[idempotence] réservation impossible', { code: erreurPose.code })
    return { etat: 'indisponible', code: erreurPose.code ?? null }
  }

  // Une ligne rendue = personne n'avait la clé = on possède le bail.
  if (pose && pose.length > 0) return { etat: 'acquis' }

  // Zéro ligne rendue : une ligne existait déjà. On la lit pour trancher.
  const { data: existante, error: erreurLecture } = await supabase
    .from('coach_idempotency_keys')
    .select('request_hash, state, response_status, response_body, lease_until')
    .eq('key', ctx.cle)
    .eq('coach_id', ctx.coachId)
    .eq('endpoint', ctx.endpoint)
    .maybeSingle<LigneIdem>()

  if (erreurLecture) {
    console.error('[idempotence] relecture impossible', { code: erreurLecture.code })
    return { etat: 'indisponible', code: erreurLecture.code ?? null }
  }

  if (!existante) {
    // La ligne a expiré ou été libérée entre les deux appels. Une seule reprise,
    // jamais de boucle : une boucle sur une base qui vacille est un amplificateur.
    return debuterApresDisparition(ctx)
  }

  // Même clé, corps différent : ce n'est pas un rejeu, c'est une erreur d'appelant.
  // On le dit AVANT de regarder l'état : un corps différent sur une clé en vol est
  // tout aussi fautif qu'un corps différent sur une clé terminée.
  if (existante.request_hash !== ctx.requestHash) return { etat: 'conflit_corps' }

  if (existante.state === 'completed') {
    return {
      etat: 'rejeu',
      status: existante.response_status ?? 200,
      body: existante.response_body,
    }
  }

  // `in_flight`. Le bail court-il encore ?
  if (new Date(existante.lease_until).getTime() > maintenant.getTime()) {
    return { etat: 'en_vol' }
  }

  // Bail expiré : la fonction précédente a été tuée. Reprise par comparaison-et-
  // échange. Le `.eq('state','in_flight')` + `.lt('lease_until', now)` garantit
  // qu'une seule des requêtes concurrentes reprend la main.
  const { data: repris, error: erreurReprise } = await supabase
    .from('coach_idempotency_keys')
    .update({ lease_until: new Date(maintenant.getTime() + DUREE_BAIL_MS).toISOString() })
    .eq('key', ctx.cle)
    .eq('coach_id', ctx.coachId)
    .eq('endpoint', ctx.endpoint)
    .eq('state', 'in_flight')
    .lt('lease_until', maintenant.toISOString())
    .select('key')

  if (erreurReprise) {
    console.error('[idempotence] reprise de bail impossible', { code: erreurReprise.code })
    return { etat: 'indisponible', code: erreurReprise.code ?? null }
  }

  return repris && repris.length > 0 ? { etat: 'acquis' } : { etat: 'en_vol' }
}

/** Une seule reprise après disparition de la ligne. Pas de récursion. */
async function debuterApresDisparition(ctx: ContexteIdempotence): Promise<VerdictIdempotence> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('coach_idempotency_keys')
    .upsert(
      {
        key: ctx.cle,
        coach_id: ctx.coachId,
        endpoint: ctx.endpoint,
        request_hash: ctx.requestHash,
        state: 'in_flight',
        lease_until: new Date(Date.now() + DUREE_BAIL_MS).toISOString(),
      },
      { onConflict: 'key,coach_id,endpoint', ignoreDuplicates: true },
    )
    .select('key')

  if (error) return { etat: 'indisponible', code: error.code ?? null }
  return data && data.length > 0 ? { etat: 'acquis' } : { etat: 'en_vol' }
}

/**
 * Clôture — la réponse devient rejouable pendant 24 h.
 *
 * CE QU'ON NE MÉMORISE JAMAIS ICI : token QR, chemin de PDF signé,
 * `deciplus_member_id`. Aucune des routes idempotentes ne les renvoie
 * aujourd'hui ; la règle est écrite pour que ça reste vrai demain.
 */
export async function terminerIdempotence(
  ctx: ContexteIdempotence,
  status: number,
  body: unknown,
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('coach_idem_complete', {
    p_key: ctx.cle,
    p_coach: ctx.coachId,
    p_endpoint: ctx.endpoint,
    p_body: body,
    p_status: status,
  })
  if (error) console.error('[idempotence] clôture impossible', { code: error.code })
}

/**
 * Libération sur REFUS MÉTIER — la subtilité que la migration 0007 nomme.
 *
 * Un `SLOT_FULL` à 14h02 ne doit pas être figé 24 h alors qu'un siège peut se
 * libérer à 14h03. Seules les RÉUSSITES sont mémorisées ; un refus efface la
 * réservation de clé et laisse le coach réessayer.
 */
export async function libererIdempotence(ctx: ContexteIdempotence): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('coach_idem_release', {
    p_key: ctx.cle,
    p_coach: ctx.coachId,
    p_endpoint: ctx.endpoint,
  })
  if (error) console.error('[idempotence] libération impossible', { code: error.code })
}

// ---------------------------------------------------------------------------
// Réponses HTTP
// ---------------------------------------------------------------------------

/**
 * Rejeu : le statut ET le corps mémorisés, à l'identique. `Idempotent-Replay`
 * est un EN-TÊTE et pas un champ de corps — le corps est contractuel, il ne
 * bouge pas, et Brad peut quand même distinguer un rejeu en débogage.
 */
export function reponseRejeu(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'idempotent-replay': 'true',
      'x-request-id': requestId,
    },
  })
}

/**
 * spec-04 §4.6 — l'enum `ErrorCode` d'`openapi.yaml` est FERMÉE et ne contient
 * rien du genre `IDEMPOTENCY_CONFLICT`. On reste donc sur `CONFLICT` (409,
 * « transition d'état illégale ») et on précise dans `details.reason`.
 * Ajouter un code à l'enum est une PR relue par les trois lots (cahier §14) :
 * c'est une question ouverte, pas une décision qu'on prend seul dans ce fichier.
 */
export function reponseConflitIdempotence(
  raison: 'idempotency_key_reuse' | 'idempotency_in_flight',
  requestId: string,
  message?: string,
): Response {
  const entetes: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': requestId,
  }
  // « En vol » est transitoire : on ne fait pas attendre la seconde requête (en
  // serverless, attendre c'est payer, et une fonction bloquée peut être tuée en
  // laissant la ligne `in_flight`). On lui dit de revenir dans une seconde.
  if (raison === 'idempotency_in_flight') entetes['retry-after'] = '1'

  const corps = {
    error: {
      code: 'CONFLICT' as const,
      message:
        message ??
        (raison === 'idempotency_in_flight'
          ? 'Une requête identique est déjà en cours de traitement.'
          : "Cette clé d'idempotence a déjà été utilisée avec un autre contenu."),
      details: { reason: raison, request_id: requestId },
    },
  }
  return new Response(JSON.stringify(corps), { status: 409, headers: entetes })
}

/** `Idempotency-Key` absente ou malformée — cahier §1.2 la rend obligatoire. */
export function reponseCleManquante(requestId: string): Response {
  const corps = {
    error: {
      code: 'VALIDATION_ERROR' as const,
      message: MESSAGES_ERREUR.VALIDATION_ERROR,
      details: {
        issues: [{ path: 'Idempotency-Key', code: 'invalid_format' }],
        request_id: requestId,
      },
    },
  }
  return new Response(JSON.stringify(corps), {
    status: 400,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId },
  })
}
