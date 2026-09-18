import 'server-only'

import { empreinte, hachePoivre, nouvelUuid } from './crypto'

/**
 * Contexte de requête — spec-04 §0.3 et §3.5.
 *
 * DEUX PIÈGES QUE CE FICHIER EXISTE POUR ÉVITER.
 *
 * 1. `request.ip` et `request.geo` N'EXISTENT PLUS sur `NextRequest` depuis
 *    Next 15 : « The `geo` and `ip` properties on NextRequest have been removed
 *    as these values are provided by your hosting provider. »
 *    Tout tutoriel Next 14 qui traîne en ligne écrira `request.ip`. Il ne
 *    compilera pas, et s'il compile c'est qu'on a mis un `any` quelque part.
 *
 * 2. On ne fait PAS `split(',')[0]`. Ce réflexe vient d'Express derrière nginx,
 *    où `x-forwarded-for` est une liste à laquelle n'importe qui peut préfixer
 *    une valeur. Sur Vercel, l'en-tête est ÉCRASÉ par la plateforme et contient
 *    l'IP publique du client, point : « we currently overwrite the
 *    X-Forwarded-For header and do not forward external IPs. This restriction is
 *    in place to prevent IP spoofing. » Prendre « le premier élément » d'une
 *    valeur qui n'est pas une liste, c'est au mieux inutile, au pire une porte
 *    ouverte le jour où on quitte Vercel sans y repenser.
 */

const POIVRE_IP = (process.env.AUDIT_IP_PEPPER ?? '').trim()

/**
 * Un poivre absent n'empêche pas de servir — mais il rend l'anonymisation
 * cosmétique, et c'est le genre de trou qu'on ne voit jamais si personne ne
 * crie. On crie une fois par processus, pas à chaque requête.
 */
let poivreDejaSignale = false
function poivre(): string {
  if (!POIVRE_IP && !poivreDejaSignale) {
    poivreDejaSignale = true
    console.warn(
      '[securite] AUDIT_IP_PEPPER absent : les ip_hash sont réversibles par force brute. ' +
        'Poser 32 octets aléatoires dans l’environnement (spec-04 §3.5).',
    )
  }
  return POIVRE_IP
}

export const IP_INCONNUE = 'unknown'

export function clientIp(req: Request): string {
  const valeur =
    req.headers.get('x-vercel-forwarded-for') ??
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    IP_INCONNUE
  return valeur.trim() || IP_INCONNUE
}

/** IP pseudonymisée pour les buckets de limite et pour `coach_audit_logs`. Jamais l'IP en clair. */
export function ipHash(ip: string): string {
  return hachePoivre(poivre(), ip, 32)
}

/**
 * spec-04 §12 q.13 — journaliser un e-mail en clair sur un échec de connexion
 * dupliquerait de la PII dans un journal append-only, donc dans une table qu'on
 * ne saura pas purger sur `DELETE /me`. Le hash poivré permet quand même de
 * compter « 40 échecs sur le même compte » sans stocker le compte.
 */
export function emailHash(email: string): string {
  return hachePoivre(poivre(), email.trim().toLowerCase(), 32)
}

const FORME_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

/**
 * On reprend l'idée de `request-id.js` d'AMAZ avec une différence de fond :
 * un `x-request-id` entrant est une DONNÉE HOSTILE. Le recopier tel quel dans
 * les journaux, c'est offrir l'injection de saut de ligne dans un journal texte
 * et l'empoisonnement de corrélation (deux requêtes qui portent le même id).
 * Forme stricte, sinon on régénère sans rien dire à l'appelant.
 */
export function requestId(req: Request): string {
  const entrant = req.headers.get('x-request-id')?.trim()
  return entrant && FORME_REQUEST_ID.test(entrant) ? entrant : `req_${nouvelUuid()}`
}

/** L'User-Agent est tronqué : c'est une chaîne contrôlée par le client. */
export function userAgent(req: Request): string {
  return (req.headers.get('user-agent') ?? '').slice(0, 300)
}

export type ContexteRequete = {
  /** Va dans l'en-tête `X-Request-Id`, dans `error.details.request_id` et dans `meta.request_id`. */
  readonly requestId: string
  /** IP en clair — NE DOIT PAS entrer dans `coach_audit_logs`. Réservée à `coach_signatures` (§3.7). */
  readonly ip: string
  readonly ipHash: string
  readonly userAgent: string
  readonly methode: string
  /** `pathname` seul, sans la query : une query peut contenir de la PII. */
  readonly route: string
  /** `pathname + search`, tel que la signature HMAC interne le couvre (§5.3). */
  readonly cheminEtQuery: string
}

export function contexteRequete(req: Request): ContexteRequete {
  const url = new URL(req.url)
  const ip = clientIp(req)
  return {
    requestId: requestId(req),
    ip,
    ipHash: ipHash(ip),
    userAgent: userAgent(req),
    methode: req.method.toUpperCase(),
    route: url.pathname,
    cheminEtQuery: `${url.pathname}${url.search}`,
  }
}

/** Empreinte UA+IP — §9.4 : champ d'audit, JAMAIS une condition d'accès. */
export function empreinteClient(ctx: ContexteRequete): string {
  return empreinte(`${ctx.userAgent}|${ctx.ipHash}`)
}
