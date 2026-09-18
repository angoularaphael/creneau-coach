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
          Votre accès coach est bloqué. Le tunnel de réservation est indisponible
          jusqu’à réactivation par la direction.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <p className="note">
          Code API : <code>403 SUSPENDED</code>
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
