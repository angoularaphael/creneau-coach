'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client navigateur — le SEUL fichier de `lib/supabase` sans `import 'server-only'`,
 * et le seul qui ait le droit d'exister côté client.
 *
 * Il ne lit que `NEXT_PUBLIC_*`, donc uniquement des valeurs destinées à partir
 * au navigateur. La clé de service n'entre jamais ici : `env.ts`, qui la lit,
 * est marqué `server-only` et casserait la compilation s'il était importé depuis
 * un composant client. C'est la barrière décrite par la doc Next
 * (« Data Security · server-only »), et elle n'est utile que si personne ne la
 * contourne « juste pour ce module-là ».
 *
 * CÔTÉ CLIENT, AUCUNE DÉCISION D'AUTORISATION. Ce client sert à ouvrir une
 * session et à écouter les changements d'état. Tout ce qui décide « ce coach
 * a-t-il le droit » se passe dans `lib/dal`, côté serveur, sous RLS.
 */

let cache: SupabaseClient | null = null

export function clientNavigateur(): SupabaseClient {
  if (cache) return cache
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cle) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquante.',
    )
  }
  cache = createBrowserClient(url, cle)
  return cache
}
