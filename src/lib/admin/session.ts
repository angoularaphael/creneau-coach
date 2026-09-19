import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { boxplusConfigure, superAdminConfigure } from './boxplus'
import { personnelConfigure, type ComptePersonnel, type RolePersonnel } from './personnel'
import { estClubId } from '@/domain/contrat'

/**
 * Session back-office — cookie signé, httpOnly, chemin `/admin`.
 *
 * L'identité vient de BOXPLUS (`app_users` + super-admin env), pas d'un mot de
 * passe partagé. Le cookie est le nôtre (SESSION_SECRET du coach) : on ne
 * réutilise pas `bc_admin_session` de la boutique.
 */

const COOKIE = 'bo_session'
const DUREE_S = 8 * 60 * 60

/**
 * La session porte désormais le PÉRIMÈTRE, pas seulement l'identité.
 *
 * Avant, elle ne disait que `role: admin | super_admin` — aucun club. Le
 * back-office lisait donc les cinq clubs pour tout le monde, ce que le cahier
 * §20 interdit explicitement pour un responsable de salle.
 *
 * `clubId` est signé dans le cookie avec le reste. Il ne peut pas être changé
 * par un paramètre d'URL, ni par un champ de formulaire : c'est toute la
 * différence entre un filtre et une frontière.
 */
export type SessionBo = ComptePersonnel

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).')
  }
  return s
}

export function porteConfiguree(): boolean {
  const sessionOk = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
  return sessionOk && (personnelConfigure() || boxplusConfigure() || superAdminConfigure())
}

const ROLES: readonly RolePersonnel[] = ['salle', 'direction', 'super_admin']

/**
 * Relecture du contenu du cookie.
 *
 * Elle est STRICTE, et le point qui compte est le dernier : un rôle `salle`
 * sans club est refusé. Si on laissait passer, `clubId: null` voudrait dire
 * « tous les clubs » — un compte de salle mal formé deviendrait une direction.
 * C'est le genre de glissement qui ne se voit jamais en relisant le code
 * d'appel, parce qu'il se produit ici.
 */
function chargeValide(brut: unknown): SessionBo | null {
  if (!brut || typeof brut !== 'object') return null
  const o = brut as Record<string, unknown>

  const identifiant = String(o.identifiant ?? '').trim().toLowerCase()
  if (!identifiant || identifiant.length > 64) return null

  const role = String(o.role ?? '') as RolePersonnel
  if (!ROLES.includes(role)) return null

  const brutClub = o.clubId
  const clubId = brutClub == null ? null : String(brutClub)
  if (clubId !== null && !estClubId(clubId)) return null

  if (role === 'salle' && clubId === null) return null
  if (role !== 'salle' && clubId !== null) return null

  const libelle = String(o.libelle ?? identifiant).slice(0, 80)
  return { identifiant, role, clubId, libelle }
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
    path: '/',
    maxAge: DUREE_S,
  }
}
