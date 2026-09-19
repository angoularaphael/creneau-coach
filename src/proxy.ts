import { NextResponse, type NextRequest } from 'next/server'

import { isAuthMockEnabled, isSupabaseConfigured } from '@/lib/auth/config'
import { rafraichirSession } from '@/lib/supabase/proxy'

/**
 * Proxy Next 16 (ex-middleware.ts).
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Pas une frontière de sécurité : l’auth est refaite dans les routes et la RLS.
 * Ici : rafraîchir la session Supabase, et renvoyer un anonyme hors des pages privées.
 */

/**
 * Deux portes distinctes, et c'est volontaire.
 *
 * `/espace-coach` est la surface du coach : session Supabase, un compte par personne.
 * `/admin` est la surface de l'équipe : mot de passe partagé, cookie signé à part.
 *
 * Elles ne partagent rien. Un coach connecté n'entre pas dans le back-office, et le
 * cookie du back-office ne donne aucun droit côté coach.
 *
 * Aucun lien du site public ne mène à `/admin` : la route se connaît, elle ne se
 * découvre pas. Ce n'est pas une protection — l'obscurité n'en est jamais une — mais
 * ça évite d'exposer la cible à tout visiteur de passage.
 *
 * Et comme toujours : ce proxy N'EST PAS la frontière de sécurité. Le contrôle est
 * refait dans `src/lib/dal/back-office.ts`, parce qu'un changement de `matcher`
 * retirerait silencieusement cette couverture.
 */

/**
 * LA POLITIQUE DE SÉCURITÉ DU CONTENU, AVEC NONCE.
 *
 * Elle vivait en en-tête statique dans `next.config.mjs`, avec `script-src 'self'`.
 * Next amorce l'hydratation par des scripts EN LIGNE : ils étaient tous bloqués.
 * Conséquence, sur toutes les pages et depuis le premier jour de cette CSP :
 * React n'hydratait jamais. Aucune animation au défilement, aucune bascule,
 * aucun gestionnaire d'événement. Le site était une image.
 *
 * La documentation de Next est nette : un nonce doit être imprévisible et
 * RENOUVELÉ À CHAQUE REQUÊTE, ce qu'un en-tête statique ne sait pas faire. Il se
 * pose donc ici, sur la requête (`x-nonce`, que Next lit pour taguer ses propres
 * scripts) et sur la réponse.
 *
 * `'strict-dynamic'` : un script chargé par un script déjà autorisé est autorisé
 * à son tour. C'est ce qui permet de ne PAS lister `'self'` ni d'ouvrir
 * `'unsafe-inline'` côté script, tout en laissant Next charger ses fragments.
 *
 * `'unsafe-eval'` uniquement en développement : React s'en sert pour reconstruire
 * les piles d'erreur serveur dans le navigateur. Ni React ni Next n'en ont besoin
 * en production.
 *
 * `style-src` garde `'unsafe-inline'` volontairement : les attributs `style=`
 * du code sont gouvernés par `style-src-attr`, qui retombe sur `style-src`. Les
 * interdire casserait des pages sans rien apporter — un style ne s'exécute pas.
 */
function politiqueCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    'frame-src https://secure.payplug.com https://www.paypal.com',
    'upgrade-insecure-requests',
  ].join('; ')
}

/**
 * Le nom du cookie du back-office, redit ici — et c'est délibéré.
 *
 * La source de vérité est `COOKIE_BO` dans `src/lib/admin/session.ts`, mais ce
 * module porte `server-only` et `node:crypto` : il est inimportable depuis le
 * proxy, qui tourne sur le runtime edge. Un doublon assumé et commenté vaut
 * mieux qu'un import qui casse la compilation au premier déploiement.
 *
 * Si le nom change là-bas, il change ici. Rien d'autre ne dépend de cette
 * ligne : le proxy ne fait que constater la PRÉSENCE du cookie, et c'est la
 * couche de données qui en vérifie la signature.
 */
const COOKIE_BO = 'bo_session'

const SURFACES_PRIVEES = ['/espace-coach']

const MOCK_COOKIE = 'coach_mock_session'

function estPrive(chemin: string) {
  if (chemin === '/espace-coach/suspendu') return false
  return SURFACES_PRIVEES.some((prefixe) => chemin.startsWith(prefixe))
}

function versConnexion(request: NextRequest, chemin: string) {
  const destination = request.nextUrl.clone()
  destination.pathname = '/auth/connexion'
  destination.search = `?next=${encodeURIComponent(chemin)}`
  return NextResponse.redirect(destination)
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = politiqueCsp(nonce)

  /** Toute réponse du proxy repart d'ici : la CSP ne peut pas être oubliée. */
  const avecCsp = (reponse: NextResponse): NextResponse => {
    reponse.headers.set('Content-Security-Policy', csp)
    return reponse
  }

  /** `NextResponse.next()` doit recevoir les en-têtes de REQUÊTE modifiés :
   *  c'est `x-nonce` que Next lit pour taguer ses propres scripts. */
  const suivant = (): NextResponse => {
    const entetes = new Headers(request.headers)
    entetes.set('x-nonce', nonce)
    entetes.set('Content-Security-Policy', csp)
    return avecCsp(NextResponse.next({ request: { headers: entetes } }))
  }

  /**
   * LE PASSE-PLAT DU BACK-OFFICE, à part, et il faut savoir pourquoi.
   *
   * Raphael a constaté que `NextResponse.next({ request })` — la forme qui
   * reçoit l'objet requête — avalait le `Set-Cookie` du login : succès
   * silencieux, puis retour au formulaire. On ne réintroduit donc PAS cette
   * forme ici.
   *
   * On garde en revanche la surcharge d'en-têtes `{ request: { headers } }`,
   * qui est une autre forme et la seule qui fasse voyager le nonce jusqu'à
   * Next. Sans lui, la porte du back-office serait servie sous une politique
   * qui bloque les scripts d'amorçage : le formulaire s'afficherait et ne
   * réagirait pas. Un back-office qu'on ne peut pas utiliser n'est pas plus
   * sûr, il est juste inutilisable.
   *
   * Ces deux formes se ressemblent assez pour qu'on les confonde. C'est
   * exactement pour ça que la distinction est écrite ici.
   */
  const adminSuivant = (): NextResponse => suivant()

  const chemin = request.nextUrl.pathname

  // Le back-office a sa propre session (`bo_session`). On ne passe PAS par
  // `NextResponse.next({ request })` : ça a déjà avalé le Set-Cookie du login
  // (succès silencieux → retour au formulaire).
  if (chemin.startsWith('/admin')) {
    if (chemin.startsWith('/admin/connexion')) return adminSuivant()
    // Présence seulement. La SIGNATURE du jeton est vérifiée dans la couche de
    // données : un cookie forgé passe ici et se fait refuser juste après.
    if (!request.cookies.get(COOKIE_BO)?.value) {
      const destination = request.nextUrl.clone()
      destination.pathname = '/admin/connexion'
      destination.search = `?suite=${encodeURIComponent(chemin)}`
      return avecCsp(NextResponse.redirect(destination))
    }
    return adminSuivant()
  }

  const prive = estPrive(chemin)

  if (isSupabaseConfigured()) {
    const { reponse, connecte } = await rafraichirSession(request, { 'x-nonce': nonce })
    if (prive && !connecte) return avecCsp(versConnexion(request, chemin))
    return avecCsp(reponse)
  }

  if (prive && isAuthMockEnabled() && request.cookies.get(MOCK_COOKIE)?.value) {
    return suivant()
  }

  if (prive) return avecCsp(versConnexion(request, chemin))
  return suivant()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|fonts|images|api/v1/webhooks|api/cron|api/v1/internal|admin).*)',
  ],
}
