import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured } from '@/lib/auth/config';
import { cleAnonPublique, urlPubliqueSupabase } from '@/lib/supabase/public-env';

export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configuré.');
  }

  const cookieStore = await cookies();

  return createServerClient(
    urlPubliqueSupabase(),
    cleAnonPublique(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /* Server Component — le proxy écrit les cookies rafraîchis */
          }
        },
      },
    },
  );
}
