import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { COOKIE_BO, lireSession, type SessionBo } from './session'

/**
 * Exige une session back-office valide, sinon renvoie vers la porte.
 *
 * Deux couches, et elles ne font pas le même travail :
 *   — celle-ci donne une REDIRECTION propre, pour que l'utilisateur voie un
 *     formulaire et pas une page d'erreur ;
 *   — celle de `src/lib/dal/back-office.ts` LÈVE, et c'est elle la frontière :
 *     elle protège même si quelqu'un appelle la couche de données depuis un
 *     endroit où cette fonction-ci n'a pas été posée.
 *
 * Retirer l'une des deux laisse un trou. La redondance est le sujet.
 */
export async function exigeSessionBackOffice(suite = '/admin'): Promise<SessionBo> {
  const session = lireSession((await cookies()).get(COOKIE_BO)?.value)
  if (!session) {
    redirect(`/admin/connexion?suite=${encodeURIComponent(suite)}`)
  }
  return session
}
