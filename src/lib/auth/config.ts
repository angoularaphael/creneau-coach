import { cleAnonPublique, urlPubliqueSupabase } from '@/lib/supabase/public-env';

export function isSupabaseConfigured(): boolean {
  return Boolean(urlPubliqueSupabase() && cleAnonPublique());
}

/** Mock local uniquement. Jamais en production, jamais si Supabase est configuré. */
export function isAuthMockEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (isSupabaseConfigured()) return false;
  return process.env.COACH_AUTH_MOCK === '1';
}

export function authMode(): 'supabase' | 'mock' | 'unset' {
  if (isSupabaseConfigured()) return 'supabase';
  if (isAuthMockEnabled()) return 'mock';
  return 'unset';
}
