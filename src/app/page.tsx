import Image from 'next/image';
import Link from 'next/link';
import { metadataDeRoute, CLUB_PAGES } from '@/lib/seo';
import { ESPACES_PAR_CLUB, type ClubId } from '@/domain/contrat';

export const metadata = metadataDeRoute('/');

/**
 * Accueil.
 *
 * Structure reprise des sites frères (Muret, Minimes) : la page d'accueil ne
 * raconte pas tout, elle donne des PORTES. Chaque section répond à une question
 * et envoie vers la page qui y répond vraiment — c'est la même logique qui donne
 * à Muret ses pages `boxe-anglaise`, `mma`, `kick-boxing`, `transports` : une
 * intention de recherche, une page.
 *
 * Aucune photo générée : toutes viennent du pool des sites frères, ce sont de
 * vraies salles Boxing Center.
 */

const ESPACES = [
  {
    titre: 'Le ring',
    photo: '/photos/coach-ring.webp',
    alt: 'Un coach dans le coin du ring, Boxing Center',
    texte:
      'Cordes, tabouret, seau. Pour le travail aux gants, les mises en situation et les rounds chronométrés.',
  },
  {
    titre: 'L’allée des sacs',
    photo: '/photos/sacs-700.webp',
    alt: 'L’allée des sacs de frappe, Boxing Center Minimes',
    texte:
      'Sacs lourds, poires, double-élastique. Pour la puissance, le cardio et le travail en série.',
  },
  {
    titre: 'Le tapis',
    photo: '/photos/duo.webp',
    alt: 'Travail au sol sur le tapis, Boxing Center',
    texte:
      'Surface dégagée pour le sol, le grappling, la préparation physique et les étirements.',
  },
] as const;

const ETAPES = [
  {
    n: '01',
    titre: 'Choisissez l’heure',
    texte:
      'Vous voyez les créneaux réellement libres, club par club. Le prix est affiché d’avance : 10 € en heure creuse, 15 € en heure pleine.',
  },
  {
    n: '02',
    titre: 'Payez en une fois',
    texte:
      'La place est tenue dix minutes, le temps de régler. Pas de paiement fractionné, pas d’abonnement, pas d’engagement.',
  },
  {
    n: '03',
    titre: 'Entrez avec un QR',
    texte:
      'Votre QR s’ouvre cinq minutes avant le créneau et se ferme à la fin. Il ne fonctionne que dans le club réservé.',
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-label="Louer une salle">
        <h1 className="hero-titre">
          Louez une salle<br />
          <em>à l’heure.</em>
        </h1>
        <p className="hero-sous">
          Vous avez le client. Nous avons la salle, le ring et les sacs. Réservez
          l’heure qu’il vous faut, entrez avec un QR, repartez.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/clubs">
            Voir les créneaux libres
          </Link>
          <Link className="btn btn-ghost" href="/comment-ca-marche">
            Comment ça marche
          </Link>
        </div>
        <p className="hero-prix mono">
          <b>10 €</b> l’heure creuse <span aria-hidden="true">·</span> <b>15 €</b> l’heure pleine
        </p>
      </section>

      {/* ── Pour qui — on nomme le visiteur dès la deuxième section ───────── */}
      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe bande">
          <div className="bande__texte">
            <p className="sur mono">Pour les coachs indépendants</p>
            <h2>Votre client vous suit. Il lui faut un endroit.</h2>
            <p>
              Vous êtes éducateur, préparateur physique ou coach de boxe. Vous avez
              vos clients, votre méthode et votre matériel. Ce qui vous manque, c’est
              une salle équipée, quand vous en avez besoin — sans louer à l’année.
            </p>
            <p>
              Ici vous prenez une heure, dans le club qui vous arrange, et vous
              repartez. Pas d’abonnement, pas de bail, pas de caution.
            </p>
            <Link className="lien-fleche" href="/comment-ca-marche">
              Le déroulé complet
            </Link>
          </div>
          <figure className="bande__image">
            <Image
              src="/photos/coach-consignes.webp"
              alt="Un coach donne ses consignes à son client, Boxing Center"
              width={1200}
              height={800}
              sizes="(min-width: 60rem) 46vw, 100vw"
            />
          </figure>
        </div>
      </section>

      {/* ── Ce qu'on loue, concrètement ───────────────────────────────────── */}
      <section className="section">
        <div className="enveloppe">
          <p className="sur mono">Ce que vous trouvez sur place</p>
          <h2>Trois surfaces, pas une salle vide.</h2>
          <div className="cartes">
            {ESPACES.map((e) => (
              <article className="carte" key={e.titre}>
                <figure className="carte__image">
                  <Image
                    src={e.photo}
                    alt={e.alt}
                    width={700}
                    height={500}
                    sizes="(min-width: 60rem) 30vw, 100vw"
                  />
                </figure>
                <h3>{e.titre}</h3>
                <p>{e.texte}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Les clubs — la porte vers les pages club ──────────────────────── */}
      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <p className="sur mono">Cinq clubs autour de Toulouse</p>
          <h2>Celui qui est sur votre route.</h2>
          <p className="intro">
            Chaque club a ses espaces et son planning. Un créneau se réserve dans un
            club précis, et le QR n’ouvre que celui-là.
          </p>
          <ul className="clubs">
            {CLUB_PAGES.map((c) => {
              const espaces = ESPACES_PAR_CLUB[c.clubId as ClubId] ?? [];
              return (
                <li key={c.slug}>
                  <Link className="club" href={`/clubs/${c.slug}`}>
                    <span className="club__nom">{c.nom}</span>
                    <span className="club__meta mono">
                      {espaces.length} espace{espaces.length > 1 ? 's' : ''}
                    </span>
                    <span className="club__fleche" aria-hidden="true">
                      ↗
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Le déroulé ────────────────────────────────────────────────────── */}
      <section className="section">
        <div className="enveloppe">
          <p className="sur mono">En trois temps</p>
          <h2>De la grille à la porte du club.</h2>
          <ol className="etapes">
            {ETAPES.map((e) => (
              <li className="etape" key={e.n}>
                <span className="etape__n mono">{e.n}</span>
                <h3>{e.titre}</h3>
                <p>{e.texte}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Les règles, dites franchement ─────────────────────────────────── */}
      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe bande bande--inverse">
          <figure className="bande__image">
            <Image
              src="/photos/coach-garde.webp"
              alt="Travail de garde avec un coach, Boxing Center"
              width={1200}
              height={800}
              sizes="(min-width: 60rem) 46vw, 100vw"
            />
          </figure>
          <div className="bande__texte">
            <p className="sur mono">Ce qu’il faut savoir avant</p>
            <h2>Les règles tiennent en cinq lignes.</h2>
            <ul className="regles">
              <li>
                <b>Une heure</b>, du lundi au samedi, de 10 h à 19 h.
              </li>
              <li>
                <b>Deux coachs maximum</b> par espace et par heure. Vous ne serez
                jamais à cinq sur le même tapis.
              </li>
              <li>
                <b>Trois réservations</b> en cours au maximum.
              </li>
              <li>
                <b>Annulation jusqu’à 24 h avant</b> : vous recevez un avoir
                réutilisable. En dessous, le créneau est dû.
              </li>
              <li>
                <b>Certains créneaux sont réservés</b> à la boxe éducative et
                n’apparaissent pas comme libres.
              </li>
            </ul>
            <Link className="lien-fleche" href="/tarifs">
              Tarifs et avoirs en détail
            </Link>
          </div>
        </div>
      </section>

      {/* ── Dernière porte ────────────────────────────────────────────────── */}
      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Regardez ce qui est libre cette semaine.</h2>
          <p>Aucun compte n’est nécessaire pour consulter les créneaux.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les clubs et leurs créneaux
            </Link>
            <Link className="btn btn-ghost" href="/auth/inscription">
              Créer mon compte coach
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
