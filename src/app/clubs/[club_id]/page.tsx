import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { lireClubPublic, lireGrillePublic } from '@/lib/dal/clubs';
import { isClubId } from '@/lib/clubs';
import { SlotGrid } from '@/components/SlotGrid';
import { ClubSlotsToolbar } from './SlotsToolbar';
import { getSessionMe } from '@/lib/auth/session';

type Props = {
  params: Promise<{ club_id: string }>;
  searchParams: Promise<{ space_id?: string; from?: string; to?: string }>;
};

function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { club_id } = await params;
  if (!isClubId(club_id)) return { title: 'Club' };
  const club = await lireClubPublic(club_id);
  if (!club.ok) return { title: 'Club' };
  return { title: club.valeur.name };
}

export default async function ClubDetailPage({ params, searchParams }: Props) {
  const { club_id } = await params;
  const sp = await searchParams;
  if (!isClubId(club_id)) notFound();

  const clubRes = await lireClubPublic(club_id);
  if (!clubRes.ok) notFound();
  const club = clubRes.valeur;

  const me = await getSessionMe().catch(() => null);
  const loggedIn = Boolean(me && me.status === 'active');

  const from =
    sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
      ? sp.from
      : todayParis();
  const to =
    sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)
      ? sp.to
      : addDaysIso(from, 6);

  const spaceId =
    sp.space_id &&
    club.spaces.some((s) => s.id === sp.space_id)
      ? sp.space_id
      : club.spaces[0]?.id;

  const grille = await lireGrillePublic({
    clubId: club.id,
    spaceId,
    from,
    to,
  });
  const grid = grille.ok ? grille.valeur : { club_id: club.id, space_id: spaceId, slots: [] };

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href="/clubs">Nos clubs</Link> / {club.city}
        </p>
        <h1>{club.name}</h1>
        {club.description ? <p>{club.description}</p> : null}
        {club.amenities?.length ? (
          <p className="muted">{club.amenities.join(' · ')}</p>
        ) : null}
      </header>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2>Créneaux</h2>
          <p>
            Prix serveur (<code>amount_cents</code>). Hold 10 min puis paiement
            1× — connectez-vous pour réserver.
          </p>
        </div>

        <ClubSlotsToolbar
          clubId={club.id}
          spaces={club.spaces}
          spaceId={spaceId}
          from={from}
          to={to}
        />

        {!loggedIn ? (
          <p className="note">
            <Link href="/auth/connexion">Connexion</Link> requise pour poser un
            hold. Compte suspendu = pas de tunnel.
          </p>
        ) : null}

        <SlotGrid
          clubId={club.id}
          spaceId={spaceId!}
          slots={grid.slots}
          loggedIn={loggedIn}
        />
      </section>
    </>
  );
}
