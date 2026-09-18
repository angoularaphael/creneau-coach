import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { boxplusConfigure, superAdminConfigure, type CompteBoxplus } from './boxplus'

/**
 * Session back-office — cookie signé, httpOnly, chemin `/admin`.
 *
 * L'identité vient de BOXPLUS (`app_users` + super-admin env), pas d'un mot de
 * passe partagé. Le cookie est le nôtre (SESSION_SECRET du coach) : on ne
 * réutilise pas `bc_admin_session` de la boutique.
 */

const COOKIE = 'bo_session'
const DUREE_S = 8 * 60 * 60

export type SessionBo = CompteBoxplus

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).')
  }
  return s
}

export function porteConfiguree(): boolean {
  const sessionOk = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
  return sessionOk && (boxplusConfigure() || superAdminConfigure())
}

function chargeValide(brut: unknown): SessionBo | null {
  if (!brut || typeof brut !== 'object') return null
  const o = brut as Record<string, unknown>
  const email = String(o.email ?? '').trim().toLowerCase()
  const role = String(o.role ?? '')
  const name = String(o.name ?? email).slice(0, 80)
  if (!email.includes('@') || email.length > 120) return null
  if (role !== 'admin' && role !== 'super_admin') return null
  return { email, role, name }
}

export function creerJeton(compte: SessionBo): { valeur: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S
  const alea = randomBytes(16).toString('hex')
  const payload = Buffer.from(JSON.stringify(compte), 'utf8').toString('base64url')
  const charge = `${exp}.${alea}.${payload}`
  const signature = createHmac('sha256', secret()).update(charge).digest('hex')
  return { valeur: `${charge}.${signature}`, maxAge: DUREE_S }
}

export function lireSession(valeur: string | undefined): SessionBo | null {
  if (!valeur) return null
  const parts = valeur.split('.')
  if (parts.length !== 4) return null
  const [exp, alea, payload, signature] = parts as [string, string, string, string]

  const attendue = createHmac('sha256', secret()).update(`${exp}.${alea}.${payload}`).digest('hex')
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(attendue, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const secondes = Number(exp)
  if (!Number.isFinite(secondes) || secondes <= Math.floor(Date.now() / 1000)) return null

  try {
    return chargeValide(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

export function jetonValide(valeur: string | undefined): boolean {
  return lireSession(valeur) !== null
}

export const COOKIE_BO = COOKIE

export function optionsCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.VERCEL === '1',
    path: '/admin',
    maxAge: DUREE_S,
  }
}
