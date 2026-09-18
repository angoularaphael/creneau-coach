import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authMode } from '@/lib/auth/config';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/espace-coach';

  if (authMode() === 'supabase' && code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/espace-coach'}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/connexion?error=callback`);
}
