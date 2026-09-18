'use server';

import { redirect } from 'next/navigation';
import { authMode } from '@/lib/auth/config';
import { validatePassword } from '@/lib/auth/password';
import { cheminInterneSur } from '@/lib/auth/redirect';
import {
  clearMockSession,
  createMockUser,
  findByEmail,
  setMockSession,
} from '@/lib/auth/mock-store';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, emailHash, ipHash } from '@/lib/security';
import { headers } from 'next/headers';

export type AuthActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const first_name = String(formData.get('first_name') || '').trim();
  const last_name = String(formData.get('last_name') || '').trim();
  const consent_cgu = formData.get('consent_cgu') === 'on';
  const consent_privacy = formData.get('consent_privacy') === 'on';

  if (!email || !password || !first_name || !last_name) {
    return { error: 'Tous les champs obligatoires doivent être renseignés.' };
  }
  if (!consent_cgu || !consent_privacy) {
    return {
      error: 'Vous devez accepter les CGU et la politique de confidentialité.',
    };
  }
  const pwdErr = validatePassword(password);
  if (pwdErr) return { error: pwdErr };

  const mode = authMode();
  if (mode === 'unset') {
    return {
      error:
        'Auth non configurée. Renseignez Supabase ou COACH_AUTH_MOCK=1 dans .env.local.',
    };
  }

  if (mode === 'mock') {
    if (findByEmail(email)) {
      return { error: 'Un compte existe déjà avec cet e-mail.' };
    }
    const user = createMockUser({ email, password, first_name, last_name });
    await setMockSession(user.id);
    redirect('/espace-coach');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: {
        first_name,
        last_name,
        consent_cgu_at: new Date().toISOString(),
        consent_privacy_at: new Date().toISOString(),
      },
    },
  });

  if (error) return { error: 'Inscription impossible. Réessayez ou connectez-vous.' };
  if (!data.session) {
    return {
      ok: true,
      message:
        'Compte créé. Vérifiez votre e-mail avant de vous connecter (lien de confirmation).',
    };
  }

  redirect('/espace-coach');
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/espace-coach');

  if (!email || !password) {
    return { error: 'E-mail et mot de passe requis.' };
  }

  const hdrs = await headers();
  const ip =
    hdrs.get('x-vercel-forwarded-for') ??
    hdrs.get('x-forwarded-for') ??
    'unknown';
  const limite = await checkRateLimit('login', {
    ipHash: ipHash(ip),
    coachId: emailHash(email),
  });
  if (!limite.allowed) {
    return { error: 'Trop de tentatives. Réessayez dans une minute.' };
  }

  const mode = authMode();
  if (mode === 'unset') {
    return {
      error:
        'Auth non configurée. Renseignez Supabase ou COACH_AUTH_MOCK=1 dans .env.local.',
    };
  }

  if (mode === 'mock') {
    const user = findByEmail(email);
    if (!user || user.password !== password) {
      return { error: 'Identifiants incorrects.' };
    }
    await setMockSession(user.id);
    redirect(cheminInterneSur(next));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Identifiants incorrects.' };

  redirect(cheminInterneSur(next));
}

export async function signOutAction() {
  const mode = authMode();
  if (mode === 'mock') {
    await clearMockSession();
  } else if (mode === 'supabase') {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect('/');
}
