import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { nomClub } from '@/lib/clubs';
import { ReservationActions } from './ReservationActions'
import { studioActif } from '@/lib/studio/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Réservation' };

export default async function ReservationPage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}`);
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  const req = contextePage(`/espace-coach/reservations/${params.id}`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();

  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  const reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>)
  const paiementsTest = await studioActif();

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href="/espace-coach">Espace coach</Link> / réservation
        </p>
        <h1>{nomClub(reservation.club_id)}</h1>
        <p>
          Espace <code>{reservation.space_id}</code> · jamais de prix inventé
          côté client.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 520 }}>
        <ReservationActions reservation={reservation} paiementsTest={paiementsTest} />
      </section>
    </>
  );
}
