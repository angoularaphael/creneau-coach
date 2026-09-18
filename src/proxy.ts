import { NextResponse, type NextRequest } from 'next/server'

/**
 * Proxy — ex-`middleware.ts`, renommé en Next 16
 * (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE PROXY N'EST PAS UNE FRONTIÈRE DE SÉCURITÉ.
 *
 * La documentation Next avertit qu'un changement de `matcher`, ou une Server
 * Function déplacée vers une autre route, retire silencieusement la couverture
 * du proxy. L'autorisation est donc refaite :
 *   1. dans chaque route handler (rôle, périmètre club, propriété de la ressource) ;
 *   2. dans Postgres, par la RLS (CAHIER §12).
 *
 * Le proxy ne fait que deux choses : rafraîchir la session Supabase, et rediriger
 * un visiteur anonyme hors des surfaces privées pour lui éviter un écran vide.
 * ────────────────────────────────────────────────────────────────────────────
 */

const SURFACES_PRIVEES = ['/admin', '/espace-coach']

export async function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname
  const reponse = NextResponse.next({ request })

  if (!SURFACES_PRIVEES.some((prefixe) => chemin.startsWith(prefixe))) {
    return reponse
  }

  // Un cookie de session Supabase est préfixé `sb-` et suffixé `-auth-token`.
  // On ne le VALIDE pas ici : un cookie forgé passera ce test et se fera refuser
  // par la route handler puis par la RLS. Ce test n'a qu'un but ergonomique.
  const aUnCookieDeSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))

  if (!aUnCookieDeSession) {
    const destination = request.nextUrl.clone()
    destination.pathname = '/connexion'
    destination.search = `?suite=${encodeURIComponent(chemin)}`
    return NextResponse.redirect(destination)
  }

  return reponse
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     *  - les assets et fichiers statiques ;
     *  - `api/v1/webhooks` : authentifié par signature Payplug / PayPal (lot A) ;
     *  - `api/cron`        : authentifié par `Authorization: Bearer CRON_SECRET` ;
     *  - `api/v1/internal` : authentifié par `x-sync-secret` (bot Deciplus).
     * Ces trois familles n'ont pas de session utilisateur : les faire passer par
     * un rafraîchissement de session serait au mieux inutile, au pire une latence
     * ajoutée sur un webhook de paiement.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|fonts|images|api/v1/webhooks|api/cron|api/v1/internal).*)',
  ],
}
