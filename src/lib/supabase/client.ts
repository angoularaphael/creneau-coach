import { createBrowserClient } from '@supabase/ssr';
import { isSupabaseConfigured } from '@/lib/auth/config';
import { cleAnonPublique, urlPubliqueSupabase } from '@/lib/supabase/public-env';

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  return createBrowserClient(urlPubliqueSupabase(), cleAnonPublique());
}
