import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSessionMe } from '@/lib/auth/session';
import { getReservationForCoach } from '@/lib/mock/reservations';
import { formatCents } from '@/lib/api/client';
import { MockPayButton } from './MockPayButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Paiement' };

type Props = { params: { id: string } };

export default async function MockPayPage({ params }: Props) {
  const me = await getSessionMe();
  if (!me) redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}/paiement-mock`);

  const reservation = getReservationForCoach(params.id, me.id);
  if (!reservation) notFound();

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href={`/espace-coach/reservations/${params.id}`}>Retour</Link>
        </p>
        <h1>Paiement 1×</h1>
        <p>
          Montant prestataire ={' '}
          <strong style={{ color: 'var(--ink)' }}>
            {formatCents(reservation.amount_cents)}
          </strong>{' '}
          (serveur).
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 480 }}>
        <Suspense>
          <MockPayButton reservationId={params.id} />
        </Suspense>
      </section>
    </>
  );
}
