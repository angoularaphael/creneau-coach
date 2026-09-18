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
const SURFACES_PRIVEES = ['/espace-coach']
const COOKIE_BO = 'bo_session'

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
  const chemin = request.nextUrl.pathname

  // ---- Back-office : porte à mot de passe partagé, indépendante de Supabase ----
  if (chemin.startsWith('/admin')) {
    if (chemin.startsWith('/admin/connexion')) return NextResponse.next({ request })
    // Présence seulement. La SIGNATURE du jeton est vérifiée dans la couche de
    // données : un cookie forgé passe ici et se fait refuser juste après.
    if (!request.cookies.get(COOKIE_BO)?.value) {
      const destination = request.nextUrl.clone()
      destination.pathname = '/admin/connexion'
      destination.search = `?suite=${encodeURIComponent(chemin)}`
      return NextResponse.redirect(destination)
    }
    return NextResponse.next({ request })
  }

  const prive = estPrive(chemin)

  if (isSupabaseConfigured()) {
    const { reponse, connecte } = await rafraichirSession(request)
    if (prive && !connecte) return versConnexion(request, chemin)
    return reponse
  }

  if (prive && isAuthMockEnabled() && request.cookies.get(MOCK_COOKIE)?.value) {
    return NextResponse.next({ request })
  }

  if (prive) return versConnexion(request, chemin)
  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|fonts|images|api/v1/webhooks|api/cron|api/v1/internal).*)',
  ],
}
