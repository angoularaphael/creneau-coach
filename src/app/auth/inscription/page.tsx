import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '../AuthForms';
import { authMode } from '@/lib/auth/config';

export const metadata: Metadata = { title: 'Inscription' };

export default function SignUpPage() {
  const mode = authMode();

  return (
    <>
      <header className="page-hero">
        <h1>Inscription coach</h1>
        <p>Compte personnel — cookies de session httpOnly.</p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 480 }}>
        {mode === 'unset' ? (
          <p className="note">
            Auth non configurée. Junior : renseigner{' '}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> +{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Brad en local :{' '}
            <code>COACH_AUTH_MOCK=1</code>.
          </p>
        ) : (
          <>
            {mode === 'mock' ? (
              <p className="note">Mode mock local (COACH_AUTH_MOCK=1) — pas de vrai e-mail.</p>
            ) : null}
            <SignUpForm />
            <p className="muted" style={{ marginTop: '1.25rem' }}>
              Déjà un compte ? <Link href="/auth/connexion">Connexion</Link>
            </p>
          </>
        )}
      </section>
    </>
  );
}
