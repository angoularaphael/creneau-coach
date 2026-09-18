import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import { cleAnon, urlSupabase } from './env'

/**
 * Client serveur porté par le cookie de session — doc Supabase « Server-Side
 * Auth · Next.js ».
 *
 * TROIS RÈGLES, TOUTES LES TROIS NON NÉGOCIABLES.
 *
 * 1. UN CLIENT PAR REQUÊTE. Jamais de cache module comme dans `service.ts` :
 *    un client partagé entre deux requêtes servirait la session d'un coach à un
 *    autre. C'est la raison pour laquelle cette fonction est `async` et ne
 *    mémorise rien.
 *
 * 2. `getAll` ET `setAll`, jamais `get`/`set`/`remove`. La doc de `@supabase/ssr`
 *    est explicite : « Failing to implement getAll and setAll correctly will
 *    cause significant and difficult to debug authentication issues ». Les
 *    méthodes unitaires sont dépréciées et ratent des cas limites.
 *
 * 3. `setAll` PEUT LEVER, et c'est normal. Dans un Server Component, Next
 *    interdit d'écrire un cookie : on avale l'erreur. Le rafraîchissement du
 *    jeton est alors la responsabilité du proxy (`src/proxy.ts`), qui, lui, a
 *    le droit d'écrire. C'est exactement le partage que décrit la doc.
 */
export async function clientServeur(): Promise<SupabaseClient> {
  const magasin = await cookies()

  return createServerClient(urlSupabase(), cleAnon(), {
    cookies: {
      getAll() {
        return magasin.getAll()
      },
      setAll(aPoser) {
        try {
          for (const { name, value, options } of aPoser) {
            magasin.set(name, value, options)
          }
        } catch {
          // Server Component : écriture de cookie interdite. Le proxy s'en charge.
          // Avaler ici est le comportement documenté, pas un contournement.
        }
      },
    },
  })
}
