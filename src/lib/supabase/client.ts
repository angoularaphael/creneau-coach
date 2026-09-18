import { createBrowserClient } from '@supabase/ssr';
import { isSupabaseConfigured } from '@/lib/auth/config';

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
