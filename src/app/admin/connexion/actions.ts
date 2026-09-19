'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { verifierCompteBoxplus } from '@/lib/admin/boxplus'
import { verifierPersonnel, type ComptePersonnel } from '@/lib/admin/personnel'
import { COOKIE_BO, creerJeton, optionsCookie } from '@/lib/admin/session'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { emailHash, ipHash } from '@/lib/security/request-context'

/**
 * Entrée dans le back-office — DEUX PORTES, une seule serrure.
 *
 *   1. limite de débit par IP + identifiant ;
 *   2. comptes du personnel (`coach_staff_accounts`) : une salle, la direction,
 *      ou le super-admin de secours pris dans l'environnement ;
 *   3. à défaut, comptes BOXPLUS (`app_users`), traités comme direction ;
 *   4. cookie httpOnly, limité à `/admin`, portant le périmètre club.
 *
 * L'ORDRE COMPTE. Les comptes du personnel passent en premier parce qu'ils
 * portent un périmètre ; BOXPLUS n'en a pas et vaut donc « tous les clubs ».
 * Inverser, ce serait donner les cinq clubs à quelqu'un qui n'a droit qu'au
 * sien, dès lors qu'il existe des deux côtés.
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

  // Le champ s'appelle encore `email` dans le formulaire : un identifiant de
  // salle (« minimes ») y passe aussi bien qu'une adresse BOXPLUS.
  const email = String(form.get('email') ?? '').trim()
  const fourni = String(form.get('motdepasse') ?? '')

  const verdict = await checkRateLimit('login', {
    ipHash: ipHash(ip),
    coachId: email ? emailHash(email) : undefined,
  })
  // Compteur HS (RPC absente, base down) : on n'enferme pas la direction.
  // Un vrai dépassement 5/min reste refusé.
  if (!verdict.allowed && !verdict.indisponible) {
    redirect('/admin/connexion?erreur=trop')
  }

  let compte: ComptePersonnel | null = await verifierPersonnel(email, fourni)

  if (!compte) {
    const bp = await verifierCompteBoxplus(email, fourni)
    if (bp) {
      // Un compte BOXPLUS n'a pas de club : il vaut donc direction, jamais
      // salle. Le traiter comme une salle sans club lui donnerait « tous »,
      // ce qui est l'exact contraire de ce qu'on veut.
      compte = {
        identifiant: bp.email,
        role: bp.role === 'super_admin' ? 'super_admin' : 'direction',
        clubId: null,
        libelle: bp.name,
      }
    }
  }

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
