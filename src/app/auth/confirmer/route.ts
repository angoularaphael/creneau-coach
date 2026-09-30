import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { authMode } from '@/lib/auth/config'
import { cheminInterneSur } from '@/lib/auth/redirect'

export const dynamic = 'force-dynamic'

const TYPES: readonly EmailOtpType[] = ['signup', 'magiclink', 'email']

/**
 * Le lien des e-mails Brevo (`src/lib/mail/envoi.ts`) arrive ici.
 *
 * Il porte un jeton haché à usage unique, vérifié par Supabase côté serveur :
 * la vérification pose la session dans les cookies, sur NOTRE domaine. Aucun
 * aller-retour par l'adresse de site configurée chez Supabase — c'est elle qui
 * envoyait les coachs vers localhost.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const suite = cheminInterneSur(searchParams.get('next') ?? '/espace-coach')
  const origine = new URL(request.url).origin

  if (authMode() === 'supabase' && tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origine}${suite}`)
  }

  // Lien déjà utilisé ou expiré : on renvoie vers la connexion, qui l'explique.
  return NextResponse.redirect(`${origine}/auth/connexion?error=callback`)
}
