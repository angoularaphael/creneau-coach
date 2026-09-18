import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'node:crypto'

export type CompteBoxplus = {
  readonly email: string
  readonly role: 'admin' | 'super_admin'
  readonly name: string
}

/**
 * Client BOXPLUS — projet `ulxtbvxdueolvnjhpzvw`, table `app_users`.
 *
 * Distinct du Supabase coach (`zpkdveyhcmxlkhuoudfr`). Lecture seule, login
 * back-office uniquement. On ne crée, ne met à jour, ni ne supprime rien.
 */
function urlBoxplus(): string {
  return (process.env.BOXPLUS_SUPABASE_URL ?? '').trim()
}

function cleBoxplus(): string {
  return (process.env.BOXPLUS_SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
}

let cache: SupabaseClient | null = null

function clientBoxplus(): SupabaseClient | null {
  const url = urlBoxplus()
  const cle = cleBoxplus()
  if (!url || !cle) return null
  if (!cache) {
    cache = createClient(url, cle, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-application-name': 'coach-reservation/boxplus-admin' } },
    })
  }
  return cache
}

function egalSecret(fourni: string, attendu: string): boolean {
  if (!attendu) return false
  const h = (v: string) => createHmac('sha256', attendu).update(v).digest()
  try {
    return timingSafeEqual(h(fourni), h(attendu))
  } catch {
    return false
  }
}

/** Hash bcrypt fixe : même coût qu'un vrai refus, sans révéler si l'e-mail existe. */
const HASH_LEURRE = '$2b$10$VhKhUsnifQNiMQ0WfQSece/cxkJcPdEuWLqz7eIXjY7u7.oo5k3JS'

function roleAutorise(role: string): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin'
}

export function boxplusConfigure(): boolean {
  return Boolean(urlBoxplus() && cleBoxplus())
}

export async function verifierCompteBoxplus(
  emailBrut: string,
  motDePasse: string,
): Promise<CompteBoxplus | null> {
  const email = emailBrut.trim().toLowerCase()
  if (!email || !motDePasse) return null

  const superEmail = (process.env.BOXPLUS_SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase()
  const superPass = (process.env.BOXPLUS_SUPER_ADMIN_PASSWORD ?? '').trim().replace(/^["']|["']$/g, '')
  if (superEmail && egalSecret(email, superEmail)) {
    if (superPass && egalSecret(motDePasse, superPass)) {
      return { email, role: 'super_admin', name: 'Super administrateur' }
    }
    return null
  }

  const sb = clientBoxplus()
  if (!sb) return null

  const { data, error } = await sb
    .from('app_users')
    .select('email, password_hash, role, name')
    .eq('email', email)
    .maybeSingle()

  if (error || !data?.password_hash) {
    await bcrypt.compare(motDePasse, HASH_LEURRE).catch(() => false)
    return null
  }

  const ok = await bcrypt.compare(motDePasse, String(data.password_hash))
  if (!ok) return null

  const roleBrut = data.role === 'super_admin' ? 'admin' : String(data.role || 'admin')
  if (!roleAutorise(roleBrut)) return null

  return {
    email: String(data.email || email).trim().toLowerCase(),
    role: roleBrut,
    name: String(data.name || data.email || email).slice(0, 80),
  }
}
