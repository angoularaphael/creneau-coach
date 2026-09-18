import 'server-only'

import type { z } from 'zod'

import { MESSAGES_ERREUR, type CodeErreur } from '@/domain/contrat'

import { hashCorpsBrut } from './crypto'

/**
 * Pont zod → erreur contractuelle — spec-04 §6 et §8.4.
 *
 * ═══ RÈGLE ABSOLUE : LES `details` NE CONTIENNENT JAMAIS LA VALEUR REÇUE ═══
 * `z.prettifyError()` et `z.treeifyError()` peuvent faire apparaître l'entrée
 * dans le message — la doc zod montre elle-même `Too short: "${iss.input}"`.
 * Or sur `POST /signature` l'entrée c'est une image base64 de 300 Ko, et sur un
 * login c'est un mot de passe. On ne se repose donc sur AUCUN formateur zod : on
 * projette nous-mêmes `{ path, code }`, et rien d'autre.
 *
 * ═══ LE `requestId` NE VA PAS À LA RACINE DU CORPS ═══
 * AMAZ renvoie `{ success, error, requestId }`. `openapi.yaml` impose
 * `{ error: { code, message, details } }` avec `required: [error]`. Le contrat
 * gagne, sans discussion : ajouter `success` casserait Brad. Le `request_id` va
 * donc dans l'en-tête `X-Request-Id` ET dans `error.details.request_id`, ce que
 * `details: { additionalProperties: true }` permet explicitement.
 */

export type ProblemeValidation = { readonly path: string; readonly code: string }

const MAX_PROBLEMES = 20

function problemesSurs(erreur: z.ZodError): ProblemeValidation[] {
  return erreur.issues.slice(0, MAX_PROBLEMES).map((i) => ({
    path: i.path.map(String).join('.') || '(racine)',
    code: i.code,
  }))
}

/** En-têtes communs à toutes les réponses de cette couche. */
function entetes(requestId: string, extra?: Record<string, string>): Headers {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  h.set('x-request-id', requestId)
  for (const [cle, valeur] of Object.entries(extra ?? {})) h.set(cle, valeur)
  return h
}

export function reponseErreurContrat(
  code: CodeErreur,
  requestId: string,
  options: {
    readonly message?: string
    readonly details?: Record<string, unknown>
    readonly status?: number
    readonly entetes?: Record<string, string>
  } = {},
): Response {
  const corps = {
    error: {
      code,
      message: options.message ?? MESSAGES_ERREUR[code],
      details: { ...(options.details ?? {}), request_id: requestId },
    },
  }
  return new Response(JSON.stringify(corps), {
    status: options.status ?? STATUTS_HTTP[code],
    headers: entetes(requestId, options.entetes),
  })
}

// Recopie locale du mapping du contrat, pour ne pas dépendre de l'ordre
// d'import de `CODES_ERREUR` dans un module `server-only`.
const STATUTS_HTTP: Record<CodeErreur, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  WEBHOOK_INVALID: 401,
  FORBIDDEN: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  SLOT_FULL: 409,
  SLOT_BLOCKED: 409,
  ACTIVE_LIMIT: 409,
  HOLD_EXPIRED: 409,
  PAYMENT_REQUIRED: 409,
  SIGNATURE_REQUIRED: 409,
  CANCEL_TOO_LATE: 409,
  PRICE_MISMATCH: 409,
  CONFLICT: 409,
  QR_WINDOW_CLOSED: 410,
  QR_WRONG_CLUB: 422,
  RATE_LIMITED: 429,
}

export function reponseJsonContrat<T>(
  donnees: T,
  requestId: string,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: entetes(requestId, extra),
  })
}

export type ResultatValidation<T> =
  | { readonly ok: true; readonly data: T; readonly problemes?: undefined }
  | { readonly ok: false; readonly reponse: Response; readonly problemes: ProblemeValidation[] }

export function valider<S extends z.ZodType>(
  schema: S,
  entree: unknown,
  requestId: string,
): ResultatValidation<z.infer<S>> {
  const r = schema.safeParse(entree)
  if (r.success) return { ok: true, data: r.data }

  const problemes = problemesSurs(r.error)
  return {
    ok: false,
    problemes,
    reponse: reponseErreurContrat('VALIDATION_ERROR', requestId, {
      details: { issues: problemes },
    }),
  }
}

export type CorpsLu =
  | { readonly ok: true; readonly brut: string; readonly hash: string; readonly json: unknown }
  | { readonly ok: false; readonly reponse: Response }

/**
 * Lit le corps UNE SEULE FOIS, le hache BRUT, puis le parse.
 *
 * L'ordre n'est pas négociable — spec-04 §4.4. Un `Request` ne se relit pas :
 * `await request.text()` consomme le flux. Et le hash doit porter sur le texte
 * reçu, jamais sur `JSON.stringify(JSON.parse(x))`, qui n'est pas `x` :
 * les espaces disparaissent, `1e2` devient `100`, les échappements unicode se
 * normalisent. C'est le hash qui sert de `request_hash` d'idempotence et de
 * `sha256(corps)` dans la signature interne : deux mécanismes qui tombent en
 * silence si on se trompe ici.
 */
export async function lireCorps(req: Request, requestId: string): Promise<CorpsLu> {
  let brut: string
  try {
    brut = await req.text()
  } catch {
    return {
      ok: false,
      reponse: reponseErreurContrat('VALIDATION_ERROR', requestId, {
        details: { issues: [{ path: '(corps)', code: 'unreadable' }] },
      }),
    }
  }

  const hash = hashCorpsBrut(brut)

  // Corps vide : légitime (POST /cancel n'en a pas). On rend `{}` pour que
  // `strictObject({})` valide, au lieu de forcer chaque route à gérer le cas.
  if (brut.trim() === '') return { ok: true, brut, hash, json: {} }

  try {
    return { ok: true, brut, hash, json: JSON.parse(brut) }
  } catch {
    // On ne renvoie SURTOUT pas le message de `JSON.parse` : il contient un
    // extrait du corps (« Unexpected token } in JSON at position 42 » avec le
    // contexte selon les moteurs), donc potentiellement un mot de passe.
    return {
      ok: false,
      reponse: reponseErreurContrat('VALIDATION_ERROR', requestId, {
        details: { issues: [{ path: '(corps)', code: 'invalid_json' }] },
      }),
    }
  }
}
