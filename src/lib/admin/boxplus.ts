import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

import { comparaisonConstante } from '@/lib/security/crypto'

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

function stripQuotes(valeur: string): string {
  return valeur.trim().replace(/^["']|["']$/g, '')
}

/**
 * Mot de passe super-admin boutique.
 *
 * Un mot de passe qui commence par `#` est mangé par dotenv / Vercel (commentaire).
 * D’où `BOXPLUS_SUPER_ADMIN_PASSWORD_B64` : base64 du vrai mot de passe.
 * Alias `SUPER_ADMIN_*` = mêmes noms que BOXPLUS.
 */
export function motDePasseSuperAdmin(): string {
  const b64 = stripQuotes(process.env.BOXPLUS_SUPER_ADMIN_PASSWORD_B64 ?? '')
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8')
      if (decoded) return decoded
    } catch {
      /* ignore */
    }
  }
  for (const nom of ['BOXPLUS_SUPER_ADMIN_PASSWORD', 'SUPER_ADMIN_PASSWORD'] as const) {
    const v = stripQuotes(process.env[nom] ?? '')
    if (v) return v
  }
  return ''
}

export function emailSuperAdmin(): string {
  return stripQuotes(
    process.env.BOXPLUS_SUPER_ADMIN_EMAIL ?? process.env.SUPER_ADMIN_EMAIL ?? '',
  ).toLowerCase()
}

/** Hash bcrypt fixe : même coût qu'un vrai refus, sans révéler si l'e-mail existe. */
const HASH_LEURRE = '$2b$10$VhKhUsnifQNiMQ0WfQSece/cxkJcPdEuWLqz7eIXjY7u7.oo5k3JS'

function roleAutorise(role: string): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin'
}

export function boxplusConfigure(): boolean {
  return Boolean(urlBoxplus() && cleBoxplus())
}

export function superAdminConfigure(): boolean {
  return Boolean(emailSuperAdmin() && motDePasseSuperAdmin())
}

export async function verifierCompteBoxplus(
  emailBrut: string,
  motDePasse: string,
): Promise<CompteBoxplus | null> {
  const email = emailBrut.trim().toLowerCase()
  if (!email || !motDePasse) return null

  const superEmail = emailSuperAdmin()
  const superPass = motDePasseSuperAdmin()
  if (superEmail && comparaisonConstante(email, superEmail) && superPass) {
    if (comparaisonConstante(motDePasse, superPass)) {
      return { email, role: 'super_admin', name: 'Super administrateur' }
    }
    // Mauvais mot de passe super-admin : on tente quand même `app_users`
    // (le même e-mail peut exister en table, et un `#` avalé par dotenv
    // ne doit pas bloquer Guillaume / Brad / Eddy).
  }

  const sb = clientBoxplus()
  if (!sb) return null

  const { data, error } = await sb
    .from('app_users')
    .select('email, password_hash, role, name')
    .ilike('email', email)
    .maybeSingle()

  if (error || !data?.password_hash) {
    await bcrypt.compare(motDePasse, HASH_LEURRE).catch(() => false)
    return null
  }

  const ok = await bcrypt.compare(motDePasse, String(data.password_hash))
  if (!ok) return null

  const roleBrut = data.role === 'super_admin' ? 'super_admin' : String(data.role || 'admin')
  if (!roleAutorise(roleBrut)) return null

  return {
    email: String(data.email || email).trim().toLowerCase(),
    role: roleBrut,
    name: String(data.name || data.email || email).slice(0, 80),
  }
}
