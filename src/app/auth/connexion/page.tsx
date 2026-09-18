import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '../AuthForms';
import { authMode } from '@/lib/auth/config';

export const metadata: Metadata = { title: 'Connexion' };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const mode = authMode();
  const params = await searchParams;
  const next = params.next?.startsWith('/')
    ? params.next
    : '/espace-coach';

  return (
    <>
      <header className="page-hero">
        <h1>Connexion</h1>
        <p>Espace coach Boxing Center.</p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 480 }}>
        {params.error === 'callback' ? (
          <p className="form-error" role="alert">
            Lien de confirmation invalide ou expiré.
          </p>
        ) : null}
        {mode === 'unset' ? (
          <p className="note">
            Auth non configurée. Voir <code>.env.local</code> (Supabase ou{' '}
            <code>COACH_AUTH_MOCK=1</code>).
          </p>
        ) : (
          <>
            <SignInForm next={next} />
            <p className="muted" style={{ marginTop: '1.25rem' }}>
              Pas encore de compte ?{' '}
              <Link href="/auth/inscription">Inscription</Link>
            </p>
          </>
        )}
      </section>
    </>
  );
}
