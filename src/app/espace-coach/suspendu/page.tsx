import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionMe } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Compte suspendu' };
export const dynamic = 'force-dynamic';

export default async function SuspendedPage() {
  const me = await getSessionMe();

  return (
    <>
      <header className="page-hero">
        <h1>Compte suspendu</h1>
        <p>
          Vous ne pouvez pas réserver pour le moment. L’équipe Boxing Center doit
          réactiver votre compte avant que vous puissiez reprendre des créneaux.
        </p>
      </header>
      <section className="section">
        <p className="note">
          Contactez l’équipe pour débloquer la situation
          {me?.profile?.email ? (
            <>
              {' '}
              — compte <strong style={{ color: 'var(--ink)' }}>{me.profile.email}</strong>
            </>
          ) : null}
          .
        </p>
        <p style={{ marginTop: '1.5rem' }}>
          <Link className="btn btn-ghost" href="/contact">
            Contacter Boxing Center
          </Link>
        </p>
      </section>
    </>
  );
}
