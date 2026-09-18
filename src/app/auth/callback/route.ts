import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authMode } from '@/lib/auth/config'
import { cheminInterneSur } from '@/lib/auth/redirect'

function basePublique(): string | null {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').replace(/\/$/, '')
  return env || null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = cheminInterneSur(searchParams.get('next') ?? '/espace-coach')
  const base = basePublique()
  if (!base) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'SITE_URL manquant.' } },
        { status: 500 },
      )
    }
  }
  const origine = base || new URL(request.url).origin

  if (authMode() === 'supabase' && code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origine}${next}`)
    }
  }

  return NextResponse.redirect(`${origine}/auth/connexion?error=callback`)
}
