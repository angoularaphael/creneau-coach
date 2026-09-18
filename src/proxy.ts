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
 * ⚠️ `/admin` N'EST VOLONTAIREMENT PAS DANS CETTE LISTE POUR L'INSTANT.
 *
 * Le back-office est ouvert sans mot de passe le temps d'éprouver le moteur
 * (créneaux, capacités, blocages, holds) sur de vraies données. C'est une
 * décision de développement, pas un oubli.
 *
 * La porte n'est pas pour autant grande ouverte : `src/lib/dal/back-office.ts`
 * REFUSE de répondre dès que `NODE_ENV === 'production'`, parce qu'il lit la base
 * avec la clé `service_role` qui ignore la RLS. Une mise en ligne dans cet état
 * ne donne pas un back-office ouvert : elle donne une page en erreur.
 *
 * Pour refermer : remettre '/admin' ci-dessous, et remplacer le garde-fou de
 * `back-office.ts` par le contrôle de rôle réel (manager_salle | direction).
 */
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
  const chemin = request.nextUrl.pathname
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
