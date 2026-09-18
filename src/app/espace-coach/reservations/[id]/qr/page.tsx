// Next 16 : `params` est une Promise, la compatibilite synchrone a ete retiree.
// https://nextjs.org/docs/app/guides/upgrading/version-16
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import {
  buildMockQrPng,
  getReservationForCoach,
} from '@/lib/mock/reservations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR d’accès' };

type Props = { params: Promise<{ id: string }> };

export default async function QrPage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) {
    redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}/qr`);
  }

  const reservation = getReservationForCoach(params.id, me.id);
  if (!reservation) notFound();

  if (reservation.status !== 'confirmed') {
    redirect(`/espace-coach/reservations/${params.id}`);
  }

  const png = buildMockQrPng(reservation);

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href={`/espace-coach/reservations/${params.id}`}>Retour</Link>
        </p>
        <h1>QR d’accès</h1>
        <p>
          Valide de T−5 à la fin du créneau · club{' '}
          <code>{reservation.club_id}</code>. Token opaque (mock) — pas d’UUID
          résa dans le PNG final Raphael.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 360 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={png}
          alt="QR d’accès créneau"
          width={280}
          height={280}
          style={{ width: '100%', maxWidth: 280, background: '#fff' }}
        />
        <p className="note">
          Fenêtre : {reservation.qr_valid_from} → {reservation.qr_valid_to}
        </p>
      </section>
    </>
  );
}
