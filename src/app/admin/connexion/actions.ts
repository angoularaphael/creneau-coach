'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { COOKIE_BO, creerJeton, motDePasseValide, optionsCookie } from '@/lib/admin/session'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { ipHash } from '@/lib/security/request-context'

/**
 * Entrée dans le back-office.
 *
 * Trois protections, dans cet ordre :
 *   1. limite de débit par IP — 5 essais par minute, le même compteur Postgres que
 *      le reste de l'application. Sans elle, un mot de passe partagé se casse à la
 *      force brute en quelques heures ;
 *   2. comparaison en temps constant du mot de passe ;
 *   3. cookie signé, httpOnly, limité au chemin `/admin`.
 *
 * La redirection après succès n'accepte QUE des chemins internes commençant par
 * `/admin`. Sans ce contrôle, `?suite=https://site-pirate/` ferait de cette page
 * une redirection ouverte, utilisable pour maquiller un hameçonnage derrière le
 * domaine de Boxing Center.
 */
function destinationSure(suite: unknown): string {
  const s = String(suite ?? '')
  // Un chemin interne, et rien d'autre : pas de `//hote`, pas de `http://…`.
  return /^\/admin(\/[^\s]*)?$/.test(s) && !s.startsWith('//') ? s : '/admin'
}

export async function actionEntrer(form: FormData) {
  const entetes = await headers()
  const ip =
    entetes.get('x-vercel-forwarded-for') ??
    entetes.get('x-forwarded-for') ??
    '0.0.0.0'

  const verdict = await checkRateLimit('login', { ipHash: ipHash(ip) })
  if (!verdict.allowed) {
    redirect('/admin/connexion?erreur=trop')
  }

  const fourni = String(form.get('motdepasse') ?? '')
  if (!motDePasseValide(fourni)) {
    // Aucune distinction entre « mauvais mot de passe » et « porte mal configurée ».
    redirect('/admin/connexion?erreur=refus')
  }

  const jeton = creerJeton()
  ;(await cookies()).set(COOKIE_BO, jeton.valeur, optionsCookie())

  redirect(destinationSure(form.get('suite')))
}

export async function actionSortir() {
  ;(await cookies()).set(COOKIE_BO, '', { ...optionsCookie(), maxAge: 0 })
  redirect('/admin/connexion')
}
