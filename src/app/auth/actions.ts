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
import { createServiceClient } from '@/lib/supabase/service';
import { envoyerCourriel, gabarit, mailConfigure, urlPublique } from '@/lib/mail/envoi';
import { checkRateLimit, emailHash, ipHash } from '@/lib/security';
import { headers } from 'next/headers';

export type AuthActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
};

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
      error: 'Cochez les deux cases : les conditions générales sont à accepter, la politique de confidentialité à lire.',
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

  const hdrs = await headers();
  const limite = await checkRateLimit('login', {
    ipHash: ipHash(hdrs.get('x-vercel-forwarded-for') ?? hdrs.get('x-forwarded-for') ?? 'unknown'),
    coachId: emailHash(email),
  });
  if (!limite.allowed) {
    return { error: 'Trop de tentatives. Réessayez dans une minute.' };
  }

  const metadonnees = {
    first_name,
    last_name,
    consent_cgu_at: new Date().toISOString(),
    consent_privacy_at: new Date().toISOString(),
  };

  if (!mailConfigure()) {
    return {
      error: 'L’e-mail de confirmation n’est pas disponible pour le moment. Réessayez dans un instant.',
    };
  }
  return inscrireParCourriel(email, password, first_name, metadonnees);
}

const MESSAGE_ENVOYE =
  'C’est presque fini : ouvrez l’e-mail que nous venons de vous envoyer et cliquez sur « Confirmer mon adresse ». Pensez à regarder dans les indésirables.';

/**
 * Inscription dont l'e-mail part de no-reply (`src/lib/mail/envoi.ts`).
 *
 * `generateLink` crée le compte SANS rien envoyer et rend un jeton haché ; le
 * lien est bâti sur NOTRE adresse publique et vérifié par `/auth/confirmer`.
 * Supabase n'envoie pas la confirmation.
 *
 * Adresse déjà inscrite : même réponse à l'écran (on ne dit pas à un inconnu
 * qu'un compte existe), et un lien de connexion part à la vraie propriétaire —
 * c'est aussi ce qui sauve le coach qui a perdu son premier e-mail.
 */
async function inscrireParCourriel(
  email: string,
  password: string,
  prenom: string,
  metadonnees: Record<string, string>,
): Promise<AuthActionState> {
  const admin = createServiceClient();
  const base = urlPublique();

  const nouveau = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: metadonnees },
  });

  let lien: string;
  let courriel: { sujet: string; html: string; texte: string };
  let creeId: string | null = null;

  if (!nouveau.error && nouveau.data.properties?.hashed_token) {
    creeId = nouveau.data.user?.id ?? null;
    lien = `${base}/auth/confirmer?token_hash=${encodeURIComponent(nouveau.data.properties.hashed_token)}&type=signup`;
    const g = gabarit({
      titre: `Bienvenue ${prenom}, confirmez votre adresse`,
      paragraphes: [
        'Votre compte coach Boxing Center est créé. Un clic pour confirmer votre adresse e-mail, et vous réservez vos créneaux dans nos cinq salles de Toulouse.',
      ],
      bouton: { libelle: 'Confirmer mon adresse', lien },
      apres: 'Vous n’avez rien demandé ? Ignorez cet e-mail : sans confirmation, le compte reste inactif.',
    });
    courriel = { sujet: 'Confirmez votre adresse — Boxing Center', ...g };
  } else {
    const existant = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (existant.error || !existant.data.properties?.hashed_token) {
      return { error: 'Inscription impossible. Réessayez ou connectez-vous.' };
    }
    lien = `${base}/auth/confirmer?token_hash=${encodeURIComponent(existant.data.properties.hashed_token)}&type=magiclink`;
    const g = gabarit({
      titre: 'Vous avez déjà un compte coach',
      paragraphes: [
        'Quelqu’un — sans doute vous — a demandé à créer un compte avec cette adresse, qui en a déjà un. Ce bouton vous connecte directement à votre espace.',
      ],
      bouton: { libelle: 'Entrer dans mon espace', lien },
      apres: 'Ce n’était pas vous ? Ignorez cet e-mail : personne d’autre ne l’a reçu.',
    });
    courriel = { sujet: 'Votre accès à l’espace coach — Boxing Center', ...g };
  }

  const envoi = await envoyerCourriel({ a: email, ...courriel });
  if (!envoi.ok) {
    console.error('[inscription] e-mail non parti', { raison: envoi.raison });
    // Un compte dont le lien n'est jamais parti bloquerait l'adresse : on
    // l'efface, profil compris (la clé profil → compte est RESTRICT).
    if (creeId) {
      const { error } = await admin.rpc('coach_bo_supprimer_coach', { p_id: creeId, p_acteur: 'inscription-echouee' });
      if (error) console.error('[inscription] compte orphelin', { message: error.message });
    }
    return {
      error: 'L’e-mail de confirmation n’a pas pu partir. Rien n’a été créé : réessayez dans un instant.',
    };
  }

  return { ok: true, message: MESSAGE_ENVOYE };
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
