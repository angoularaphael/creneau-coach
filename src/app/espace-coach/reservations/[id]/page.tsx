import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { nomClub } from '@/lib/clubs';
import { libelleEspace, retourPaiement } from '@/lib/libelles-coach';
import { ReservationActions } from './ReservationActions'
import { studioActif } from '@/lib/studio/session';
import { paypalActif } from '@/lib/payments/paypal';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paiement?: string; annule?: string; cancelled?: string }>;
};



export const metadata: Metadata = { title: 'Réservation' };

export default async function ReservationPage(ctx: Props) {
  const params = await ctx.params;
  const query = await ctx.searchParams;
  const retour = retourPaiement(query);
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
  const paypalDisponible = paypalActif(paiementsTest);
  // Une option dont le délai est passé n'est plus une place gardée, même si la
  // base ne l'a pas encore basculée en « expirée ». Décidé ici, à l'heure du
  // serveur — pas à celle du téléphone du coach.
  const optionEchue =
    reservation.status === 'held' &&
    Boolean(reservation.hold_expires_at) &&
    new Date(String(reservation.hold_expires_at)).getTime() <= Date.now();

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href="/espace-coach">Espace coach</Link> / réservation
        </p>
        <h1>{nomClub(reservation.club_id)}</h1>
        <p className="page-hero__sous">Espace {libelleEspace(reservation.space_id)}</p>
      </header>
      <section className="section reservation-section">
        {retour ? (
          <p className="note reservation-retour" data-ton={retour.ton} role="status">
            {retour.texte}
          </p>
        ) : null}
        <ReservationActions
          reservation={reservation}
          paiementsTest={paiementsTest}
          paypalDisponible={paypalDisponible}
          optionEchue={optionEchue}
          noteEchue={!retour}
        />
      </section>
    </>
  );
}
