import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSessionMe } from '@/lib/auth/session';
import { signOutAction } from '@/app/auth/actions';
import { formatCents } from '@/lib/api/client';
import {
  listPaymentsForCoach,
  listReservationsForCoach,
} from '@/lib/mock/reservations';
import { getClub } from '@/lib/clubs';

export const metadata: Metadata = { title: 'Espace coach' };
export const dynamic = 'force-dynamic';

function when(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default async function CoachHomePage() {
  const me = await getSessionMe();
  if (!me) redirect('/auth/connexion?next=/espace-coach');
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');
  if (me.email_verified === false) {
    return (
      <>
        <header className="page-hero">
          <h1>Vérifiez votre e-mail</h1>
          <p>
            Un lien de confirmation vous a été envoyé. L’espace coach s’ouvre
            après vérification.
          </p>
        </header>
        <section className="section" style={{ paddingTop: 0 }}>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-ghost">
              Se déconnecter
            </button>
          </form>
        </section>
      </>
    );
  }

  const name =
    [me.profile?.first_name, me.profile?.last_name].filter(Boolean).join(' ') ||
    me.profile?.email ||
    'Coach';

  const reservations = listReservationsForCoach(me.id);
  const payments = listPaymentsForCoach(me.id);

  return (
    <>
      <header className="page-hero">
        <h1>Espace coach</h1>
        <p>
          Bonjour {name}. Actives : {me.active_reservations_count ?? 0} /{' '}
          {me.max_active_reservations ?? 3} · avoir{' '}
          {formatCents(me.credits_cents ?? 0)}.
        </p>
      </header>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2>Mes réservations</h2>
          <p>
            <Link className="btn btn-primary" href="/clubs">
              Réserver un créneau
            </Link>
          </p>
        </div>

        {reservations.length === 0 ? (
          <p className="muted">Aucune réservation pour l’instant.</p>
        ) : (
          <div className="club-list">
            {reservations.map((r) => {
              const club = getClub(r.club_id);
              return (
                <Link
                  key={r.id}
                  href={`/espace-coach/reservations/${r.id}`}
                  className="club-link"
                >
                  <h3>{club?.name ?? r.club_id}</h3>
                  <p className="meta">{when(r.starts_at)}</p>
                  <p className="muted" style={{ marginTop: '0.5rem' }}>
                    {formatCents(r.amount_cents)} · <code>{r.status}</code>
                    {r.qr_ready ? ' · QR prêt' : ''}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <div className="section-head" style={{ marginTop: '2.5rem' }}>
          <h2>Historique paiements</h2>
          <p>Lecture seule — montants serveur.</p>
        </div>
        {payments.length === 0 ? (
          <p className="muted">Aucun paiement.</p>
        ) : (
          <ul className="muted" style={{ paddingLeft: '1.1rem' }}>
            {payments.map((p) => (
              <li key={p.id}>
                {formatCents(p.amount_cents)} · {p.provider} · {p.status} ·{' '}
                {new Intl.DateTimeFormat('fr-FR', {
                  timeZone: 'Europe/Paris',
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(p.created_at))}
              </li>
            ))}
          </ul>
        )}

        <p style={{ marginTop: '2rem' }}>
          <Link className="btn btn-ghost" href="/espace-coach/profil">
            Mon profil
          </Link>
        </p>

        <form action={signOutAction} style={{ marginTop: '1rem' }}>
          <button type="submit" className="btn btn-ghost">
            Se déconnecter
          </button>
        </form>
      </section>
    </>
  );
}
