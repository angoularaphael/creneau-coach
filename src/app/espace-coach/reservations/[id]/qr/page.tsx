import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireQrPourMoi, lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { pngQr } from '@/lib/qr-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR d’accès' };

type Props = { params: Promise<{ id: string }> };

export default async function QrPage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) {
    redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}/qr`);
  }

  const req = contextePage(`/espace-coach/reservations/${params.id}/qr`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();

  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  const reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>);

  if (reservation.status !== 'confirmed') {
    redirect(`/espace-coach/reservations/${params.id}`);
  }

  const secret = await lireQrPourMoi(req, session.valeur.supabase, params.id);
  if (!secret.ok) notFound();

  let png = '';
  try {
    png = await pngQr(
      secret.valeur.qr_jti,
      secret.valeur.club_id,
      secret.valeur.qr_valid_from,
      secret.valeur.qr_valid_to,
    );
  } catch {
    png = '';
  }

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href={`/espace-coach/reservations/${params.id}`}>Retour</Link>
        </p>
        <h1>QR d’accès</h1>
        <p>
          Valide de T−5 à la fin du créneau · club{' '}
          <code>{reservation.club_id}</code>. Token HMAC opaque — pas d’UUID
          résa dans le PNG.
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0, maxWidth: 360 }}>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={png}
            alt="QR d’accès créneau"
            width={280}
            height={280}
            style={{ width: '100%', maxWidth: 280, background: '#fff' }}
          />
        ) : (
          <p className="note">QR indisponible (clé HMAC manquante côté serveur).</p>
        )}
        <p className="note">
          Fenêtre : {reservation.qr_valid_from} → {reservation.qr_valid_to}
        </p>
      </section>
    </>
  );
}
