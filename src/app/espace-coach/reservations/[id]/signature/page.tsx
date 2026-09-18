import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { SignaturePad } from './SignaturePad';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Signature' };

type Props = { params: Promise<{ id: string }> };

export default async function SignaturePage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) {
    redirect(
      `/auth/connexion?next=/espace-coach/reservations/${params.id}/signature`,
    );
  }

  const req = contextePage(`/espace-coach/reservations/${params.id}/signature`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();
  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  const reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>);

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
