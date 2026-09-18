'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { verifierCompteBoxplus } from '@/lib/admin/boxplus'
import { COOKIE_BO, creerJeton, optionsCookie } from '@/lib/admin/session'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { emailHash, ipHash } from '@/lib/security/request-context'

/**
 * Entrée dans le back-office — mêmes personnes que BOXPLUS.
 *
 *   1. limite de débit par IP + e-mail ;
 *   2. vérif contre `app_users` (bcrypt) ou SUPER_ADMIN env BOXPLUS ;
 *   3. cookie coach httpOnly, limité à `/admin`.
 *
 * La redirection après succès n'accepte QUE des chemins internes `/admin`.
 */
function destinationSure(suite: unknown): string {
  const s = String(suite ?? '')
  return /^\/admin(\/[^\s]*)?$/.test(s) && !s.startsWith('//') ? s : '/admin'
}

export async function actionEntrer(form: FormData) {
  const entetes = await headers()
  const ip =
    entetes.get('x-vercel-forwarded-for') ??
    entetes.get('x-forwarded-for') ??
    '0.0.0.0'

  const email = String(form.get('email') ?? '').trim()
  const fourni = String(form.get('motdepasse') ?? '')

  const verdict = await checkRateLimit('login', {
    ipHash: ipHash(ip),
    coachId: email ? emailHash(email) : undefined,
  })
  if (!verdict.allowed) {
    redirect('/admin/connexion?erreur=trop')
  }

  const compte = await verifierCompteBoxplus(email, fourni)
  if (!compte) {
    redirect('/admin/connexion?erreur=refus')
  }

  const jeton = creerJeton(compte)
  ;(await cookies()).set(COOKIE_BO, jeton.valeur, optionsCookie())

  redirect(destinationSure(form.get('suite')))
}

export async function actionSortir() {
  ;(await cookies()).set(COOKIE_BO, '', { ...optionsCookie(), maxAge: 0 })
  redirect('/admin/connexion')
}
