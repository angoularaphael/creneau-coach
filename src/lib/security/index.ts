import 'server-only'

/**
 * Couche sécurité — point d'entrée unique. Spec : `.research/spec-04-securite.md`.
 *
 * ═══ OÙ VIT QUOI, ET POURQUOI PAS AILLEURS ═══
 *
 *   proxy.ts               session Supabase + nonce CSP. RIEN D'AUTRE.
 *   next.config.ts         en-têtes statiques (HSTS, nosniff, Referrer, X-Robots-Tag)
 *   lib/security/*         ce dossier — 'server-only'
 *   lib/dal/*              autorisation + requêtes — 'server-only'
 *   app/api/v1/**          compose, puis délègue à la DAL
 *
 * Le réflexe Express « rate-limit + auth + validation dans un middleware global »
 * est exactement ce qu'il NE FAUT PAS faire en Next 16. La doc est explicite :
 * « A matcher change or a refactor that moves a Server Function to a different
 * route can silently remove Proxy coverage. Always verify authentication and
 * authorization inside each Server Function rather than relying on Proxy alone. »
 * Et le proxy peut être déployé sur le CDN, donc hors du runtime applicatif :
 * il ne voit pas forcément la base. Un compteur de débit posé là ne compte rien.
 *
 * → Limite de débit, idempotence, autorisation, validation : DANS LE ROUTE
 *   HANDLER ET LA DAL. Jamais dans le proxy.
 */

export * from './crypto'
export * from './request-context'
export * from './rate-limit'
export * from './idempotency'
export * from './internal-auth'
export * from './audit'
export * from './validation'
export * as schemas from './schemas'
