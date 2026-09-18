export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

/** Mode démo Brad sans projet Supabase (cookie httpOnly, pas de JWT localStorage). */
export function isAuthMockEnabled(): boolean {
  return process.env.COACH_AUTH_MOCK === '1';
}

export function authMode(): 'supabase' | 'mock' | 'unset' {
  if (isSupabaseConfigured()) return 'supabase';
  if (isAuthMockEnabled()) return 'mock';
  return 'unset';
}
