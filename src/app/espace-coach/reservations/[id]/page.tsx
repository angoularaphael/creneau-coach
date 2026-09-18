// Next 16 : `params` est une Promise, la compatibilite synchrone a ete retiree.
// https://nextjs.org/docs/app/guides/upgrading/version-16
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { getReservationForCoach } from '@/lib/mock/reservations';
import { ReservationActions } from './ReservationActions';
import { getClub } from '@/lib/clubs';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Réservation' };

export default async function ReservationPage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}`);
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  const reservation = getReservationForCoach(params.id, me.id);
  if (!reservation) notFound();

  const club = getClub(reservation.club_id);

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href="/espace-coach">Espace coach</Link> / réservation
        </p>
        <h1>{club?.name ?? reservation.club_id}</h1>
        <p>
          Espace <code>{reservation.space_id}</code> · jamais de prix inventé
          côté client.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 520 }}>
        <ReservationActions reservation={reservation} />
      </section>
    </>
  );
}
