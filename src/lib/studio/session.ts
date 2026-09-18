import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Mode studio — comme `bc_studio` sur la boutique.
 *
 * Cookie Path=/ pour que le checkout de l'espace coach (même navigateur)
 * utilise les clés Payplug TEST. Sans ce cookie, le live.
 */

export const COOKIE_STUDIO = 'coach_studio'
const DUREE_S = 12 * 60 * 60

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).')
  }
  return s
}

export function optionsCookieStudio(maxAge = DUREE_S) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export function creerJetonStudio(): string {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S
  const alea = randomBytes(16).toString('hex')
  const charge = `${exp}.${alea}.studio`
  const signature = createHmac('sha256', secret()).update(charge).digest('hex')
  return `${charge}.${signature}`
}

export function jetonStudioValide(valeur: string | undefined): boolean {
  if (!valeur) return false
  const parts = valeur.split('.')
  if (parts.length !== 4) return false
  const [exp, alea, marque, signature] = parts as [string, string, string, string]
  if (marque !== 'studio') return false
  const attendue = createHmac('sha256', secret())
    .update(`${exp}.${alea}.${marque}`)
    .digest('hex')
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(attendue, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  const secondes = Number(exp)
  return Number.isFinite(secondes) && secondes > Math.floor(Date.now() / 1000)
}

export async function studioActif(): Promise<boolean> {
  return jetonStudioValide((await cookies()).get(COOKIE_STUDIO)?.value)
}

export function etatClesPaiement(): {
  payplugTest: boolean
  payplugLive: boolean
} {
  const test = (process.env.PAYPLUG_TEST_SECRET_KEY ?? '').trim()
  const live = (process.env.PAYPLUG_SECRET_KEY ?? '').trim()
  return {
    payplugTest: Boolean(test),
    payplugLive: Boolean(live) && !live.startsWith('sk_test_'),
  }
}
