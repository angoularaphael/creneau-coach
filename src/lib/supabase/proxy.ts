import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { cleAnon, urlSupabase } from './env'

/**
 * Rafraîchissement de session pour `src/proxy.ts` — spec-04 §0.2 et §7.8.
 *
 * Ce module est la SEULE chose que le proxy a le droit d'appeler côté sécurité.
 * La doc Next est formelle : « A matcher change or a refactor that moves a Server
 * Function to a different route can silently remove Proxy coverage. Always verify
 * authentication and authorization inside each Server Function rather than
 * relying on Proxy alone. » Et : le proxy peut être « deployed to your CDN »,
 * donc tourner hors du runtime applicatif.
 *
 * → Le proxy rafraîchit le jeton et pose le nonce CSP. RIEN D'AUTRE.
 *   Pas de limite de débit (le compteur est en base, le CDN ne la voit pas).
 *   Pas d'autorisation (elle serait contournable par un changement de matcher).
 *   Pas d'idempotence. Ces trois-là vivent dans le route handler et la DAL.
 *
 * LE PIÈGE DU COOKIE : après un rafraîchissement, le nouveau jeton doit être
 * écrit SUR LA RÉPONSE **et** recopié sur la requête, sinon le rendu qui suit
 * dans la même passe continue de lire l'ancien. D'où la reconstruction de la
 * réponse dans `setAll`, qui est le motif officiel de `@supabase/ssr`.
 *
 * LE PIÈGE DU CACHE : `setAll` fournit désormais des en-têtes de cache à poser
 * sur la réponse. Les ignorer permettrait à un CDN de mettre en cache une réponse
 * porteuse d'un cookie d'authentification — et donc de servir la session d'un
 * coach à un autre. On les recopie systématiquement.
 */

export type SessionProxy = {
  readonly reponse: NextResponse
  readonly connecte: boolean
  readonly acteurId: string | null
}

export async function rafraichirSession(request: NextRequest): Promise<SessionProxy> {
  let reponse = NextResponse.next({ request })

  const supabase = createServerClient(urlSupabase(), cleAnon(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(aPoser, entetes) {
        for (const { name, value } of aPoser) {
          request.cookies.set(name, value)
        }
        reponse = NextResponse.next({ request })
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options)
        }
        // Cache-Control / Expires / Pragma fournis par la librairie.
        for (const [cle, valeur] of Object.entries(entetes)) {
          reponse.headers.set(cle, valeur)
        }
      },
    },
  })

  // `getClaims()` et non `getSession()` : c'est l'appel qui vérifie la signature
  // (spec-04 §2.1). C'est aussi lui qui déclenche le rafraîchissement du jeton.
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub ?? null

  return { reponse, connecte: Boolean(sub), acteurId: sub }
}
