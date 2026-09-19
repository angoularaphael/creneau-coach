import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { lireClubPublic, lireGrillePublic } from '@/lib/dal/clubs';
import { isClubId } from '@/lib/clubs';
import { getClubBySlug, getClubByApiId, cheminClub } from '@/lib/seo';
import { redirect } from 'next/navigation';
import { Calendrier } from '@/components/Calendrier';
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
  // Même résolution que la page : par slug d'abord, identifiant d'API ensuite.
  const fiche = getClubBySlug(club_id) ?? getClubByApiId(club_id);
  if (!fiche) return { title: 'Club' };

  const club = await lireClubPublic(fiche.clubId as Parameters<typeof lireClubPublic>[0]);
  const nom = club.ok ? club.valeur.name : fiche.nom;
  const espaces = club.ok ? club.valeur.spaces.length : 0;

  return {
    title: nom,
    description: `Louez une heure de salle à ${fiche.ville}${
      espaces ? ` — ${espaces} espace${espaces > 1 ? 's' : ''}` : ''
    }. Créneaux libres, tarif à l'heure, réservation en ligne.`,
    alternates: { canonical: cheminClub(fiche.slug) },
  };
}

/**
 * Résolution de l'URL d'un club.
 *
 * Quatre des cinq pages club répondaient 404. La page n'acceptait que
 * l'identifiant d'API (`minimes`), alors que la carte des routes, le sitemap et
 * tous les liens du site utilisent le slug de référencement (`toulouse-minimes`).
 * Seul Ramonville marchait — par hasard, son slug et son identifiant sont
 * identiques. Le parcours principal du site menait donc à une page d'erreur.
 *
 * Le slug porte la ville : c'est lui qui vaut pour la recherche locale, donc
 * c'est lui l'URL canonique. L'identifiant d'API reste accepté, mais il redirige
 * en 308 vers le slug — une seule adresse par club, jamais deux versions
 * concurrentes de la même page.
 */
export default async function ClubDetailPage({ params, searchParams }: Props) {
  const { club_id } = await params;
  const sp = await searchParams;

  const parSlug = getClubBySlug(club_id);
  if (!parSlug) {
    const parId = getClubByApiId(club_id);
    if (parId) redirect(cheminClub(parId.slug));
    notFound();
  }

  const apiId = parSlug.clubId;
  if (!isClubId(apiId)) notFound();

  const clubRes = await lireClubPublic(apiId);
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
      {/* La photo de CE club. Elle a été faite à partir d'une vraie photo de
          cette salle-là, pas d'une image générique : deux clubs ouverts côte à
          côte doivent être impossibles à confondre. */}
      <header className="page-hero page-hero--visuel" data-visuel={club.id}>
        <p className="muted">
          <Link href="/clubs">Nos clubs</Link> / {club.city}
        </p>
        <h1>{club.name}</h1>
        {club.description ? <p>{club.description}</p> : null}
        {club.amenities?.length ? (
          <p className="muted">{club.amenities.join(' · ')}</p>
        ) : null}
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Créneaux</h2>
          <p>
            Le prix est affiché d’avance et ne bouge plus une fois votre créneau
            réservé. Connectez-vous pour prendre une heure.
          </p>
        </div>

        <ClubSlotsToolbar
          clubId={club.id}
          spaces={club.spaces}
          spaceId={spaceId}
          from={from}
          to={to}
        />

        {/*
          LE MOMENT OÙ LE VISITEUR DÉCIDE.

          C'était une phrase avec deux liens de dix-huit pixels de haut. La
          norme d'accessibilité tolère un lien dans une phrase — mais ici ce
          n'est pas une phrase avec des liens dedans, c'est la SEULE porte vers
          la réservation pour quelqu'un qui n'a pas de compte. Sur téléphone,
          il visait deux mots soulignés au milieu d'un paragraphe.

          Deux vrais boutons. Le premier est celui de la majorité — la plupart
          des gens qui arrivent ici ont déjà un compte ; créer le sien est
          l'exception, donc le bouton secondaire.
        */}
        {!loggedIn ? (
          <div className="invite">
            <p className="invite__texte">
              Les créneaux sont visibles par tous. Pour en prendre un, il faut un
              compte coach — c’est gratuit et ça prend une minute.
            </p>
            <div className="invite__actions">
              <Link className="btn btn-primary" href="/auth/connexion">
                Me connecter
              </Link>
              <Link className="btn btn-ghost" href="/auth/inscription">
                Créer mon compte
              </Link>
            </div>
          </div>
        ) : null}

        <Calendrier
          clubId={club.id}
          spaceId={spaceId!}
          slots={grid.slots}
          loggedIn={loggedIn}
        />
      </section>
    </>
  );
}
