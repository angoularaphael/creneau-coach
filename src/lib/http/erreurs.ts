import { CODES_ERREUR, MESSAGES_ERREUR, type CodeErreur } from '@/domain/contrat'

/**
 * L'enveloppe d'erreur du contrat — CAHIER §1.3 :
 *
 *     { "error": { "code": "SLOT_FULL", "message": "…", "details": { … } } }
 *
 * Le projet AMAZ renvoie `{ success, error, requestId }`. Le contrat de CE projet
 * ne le permet pas : Brad et Raphael codent contre la forme ci-dessus. Le contrat
 * gagne. L'identifiant de requête voyage donc dans l'en-tête `x-request-id`,
 * ce qui ne casse personne et reste corrélable dans les journaux.
 */

export type CorpsErreur = {
  error: {
    code: CodeErreur
    message: string
    details: Record<string, unknown>
  }
}

/**
 * Erreur métier destinée à traverser la pile jusqu'au route handler.
 * Elle ne porte JAMAIS de donnée sensible : pas de PAN, pas de token QR,
 * pas d'identifiant Deciplus, pas de secret (CAHIER §3.8).
 */
export class ErreurMetier extends Error {
  readonly code: CodeErreur
  readonly details: Record<string, unknown>

  constructor(code: CodeErreur, details: Record<string, unknown> = {}, message?: string) {
    super(message ?? MESSAGES_ERREUR[code])
    this.name = 'ErreurMetier'
    this.code = code
    this.details = details
  }

  get status(): number {
    return CODES_ERREUR[this.code]
  }
}

export function erreur(
  code: CodeErreur,
  details: Record<string, unknown> = {},
  message?: string,
): ErreurMetier {
  return new ErreurMetier(code, details, message)
}

/**
 * Anti-énumération — CAHIER §1.3 : « Un coach B qui demande la résa de A reçoit
 * 404 NOT_FOUND, jamais 403 ». Hors périmètre et inexistant sont indiscernables.
 * On passe par cette fonction plutôt que par `erreur('FORBIDDEN')` partout où un
 * identifiant devinable est en jeu, pour qu'un relecteur voie l'intention.
 */
export function horsPerimetre(details: Record<string, unknown> = {}): ErreurMetier {
  return new ErreurMetier('NOT_FOUND', details)
}

export function reponseErreur(
  code: CodeErreur,
  details: Record<string, unknown> = {},
  message?: string,
  requestId?: string,
): Response {
  const corps: CorpsErreur = {
    error: { code, message: message ?? MESSAGES_ERREUR[code], details },
  }
  const entetes = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  if (requestId) entetes.set('x-request-id', requestId)
  return new Response(JSON.stringify(corps), { status: CODES_ERREUR[code], headers: entetes })
}

/**
 * Convertit n'importe quoi en réponse du contrat.
 *
 * Une erreur non prévue ne fuit jamais son message vers le client : elle devient
 * un CONFLICT générique et part dans les journaux serveur avec son requestId.
 * C'est le comportement de `error-handler.js` d'AMAZ, adapté au contrat d'ici.
 */
export function reponseDepuisErreur(e: unknown, requestId?: string): Response {
  if (e instanceof ErreurMetier) {
    return reponseErreur(e.code, e.details, e.message, requestId)
  }
  console.error(`[${requestId ?? 'sans-id'}] erreur non gérée :`, e)
  return reponseErreur('CONFLICT', {}, undefined, requestId)
}

export function reponseJson<T>(donnees: T, status = 200, requestId?: string): Response {
  const entetes = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  if (requestId) entetes.set('x-request-id', requestId)
  return new Response(JSON.stringify(donnees), { status, headers: entetes })
}
