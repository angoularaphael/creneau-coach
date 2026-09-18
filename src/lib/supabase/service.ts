import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { cleService, urlSupabase } from './env'

/**
 * Client `service_role` — spec-04 §3.5, §4, §5.4, §10.3.
 *
 * CE CLIENT IGNORE LA RLS. Il n'existe que pour les trois surfaces que la RLS ne
 * peut pas servir, parce qu'elles n'ont pas d'utilisateur connecté :
 *   — le compteur de fenêtre glissante (`coach_rate_limit_check`) ;
 *   — les clés d'idempotence et les nonces internes, révoqués à `authenticated` ;
 *   — l'écriture dans `coach_audit_logs`, dont seul `service_role` a l'INSERT.
 *
 * IL NE SERT JAMAIS À LIRE UNE DONNÉE MÉTIER POUR LE COMPTE D'UN COACH.
 * Cette phrase est la frontière entière de ce fichier : à la seconde où une
 * requête de réservation passe par ici « parce que c'est plus simple », le test
 * contractuel §13.1 (coach B → résa de A = 404) devient infalsifiable, puisque
 * plus aucune policy ne s'applique. Pour tout ce qui appartient à un coach, on
 * passe par `clientServeur()` et la RLS décide.
 */

let cache: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (cache) return cache
  cache = createClient(urlSupabase(), cleService(), {
    auth: {
      // Aucune session à persister ni à rafraîchir : ce client n'est personne.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'coach-reservation/securite' },
    },
  })
  return cache
}
