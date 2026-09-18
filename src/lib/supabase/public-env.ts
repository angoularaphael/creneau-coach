/**
 * Valeurs destinées au navigateur. Pas de service_role ici.
 */

export function urlPubliqueSupabase(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
}

/** ANON_KEY ou PUBLISHABLE_KEY (même jeton). */
export function cleAnonPublique(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim()
}
