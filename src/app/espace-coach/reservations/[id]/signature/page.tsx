import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { getReservationForCoach } from '@/lib/mock/reservations';
import { SignaturePad } from './SignaturePad';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Signature' };

type Props = { params: { id: string } };

export default async function SignaturePage({ params }: Props) {
  const me = await getSessionMe();
  if (!me) {
    redirect(
      `/auth/connexion?next=/espace-coach/reservations/${params.id}/signature`,
    );
  }

  const reservation = getReservationForCoach(params.id, me.id);
  if (!reservation) notFound();

  if (reservation.status === 'confirmed') {
    redirect(`/espace-coach/reservations/${params.id}/qr`);
  }

  if (reservation.status !== 'awaiting_signature') {
    redirect(`/espace-coach/reservations/${params.id}`);
  }

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href={`/espace-coach/reservations/${params.id}`}>Retour</Link>
        </p>
        <h1>Signature</h1>
        <p>Documents à signer après paiement / avoir.</p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 640 }}>
        <SignaturePad reservationId={params.id} />
      </section>
    </>
  );
}
