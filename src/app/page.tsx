import Image from 'next/image';
import Link from 'next/link';
import { ProchainesHeures } from '@/components/ProchainesHeures';
import { JsonLd } from '@/lib/seo/json-ld';
import { pageWebJsonLd, serviceJsonLd } from '@/lib/seo/jsonld';
import { PrechargeVisuel } from '@/components/PrechargeVisuel';
import { metadataDeRoute, CLUB_PAGES } from '@/lib/seo';
import { ESPACES_PAR_CLUB, REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat';
import { CLUBS_VERITE, TOTAL_RINGS, adresseEnLigne } from '@/lib/seo/verite';
import { PHOTOS_CLUBS } from '@/lib/photos-clubs';

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
 * Les visuels sont produits à partir des VRAIES photos des salles, passées en
 * référence au modèle : la charpente, les tapis bleu et rouge, les sacs, les
 * enseignes et les drapeaux sont ceux des clubs. La photographie est refaite,
 * la salle ne l'est pas.
 *
 * Ils ne sont jamais présentés comme la photo d'un club précis : les textes
 * disent « une salle Boxing Center », et les pages club, elles, portent le
 * visuel fait à partir de LEUR salle.
 */

const ESPACES = [
  {
    titre: 'Le ring',
    photo: '/visuels/espace-ring.webp',
    alt: 'Le coin du ring, dans une salle Boxing Center',
    texte:
      'Cordes, tabouret, seau. Pour le travail aux gants, les mises en situation et les rounds chronométrés.',
  },
  {
    titre: 'L’allée des sacs',
    photo: '/visuels/espace-sacs.webp',
    alt: 'L’allée des sacs de frappe, dans une salle Boxing Center',
    texte:
      'Sacs lourds, poires, double-élastique. Pour la puissance, le cardio et le travail en série.',
  },
  {
    titre: 'Le tapis',
    photo: '/visuels/espace-tapis.webp',
    alt: 'Le tapis dégagé, dans une salle Boxing Center',
    texte:
      'Surface dégagée pour le sol, le grappling, la préparation physique et les étirements.',
  },
] as const;

const NOM_ESPACE: Record<string, string> = {
  salle: 'Salle',
  boxe: 'Boxe',
  'mma-sol': 'MMA / Sol',
  fitness: 'Fitness',
  'boxe-fitness': 'Boxe et Fitness',
};

// Les montants et les délais viennent des réglages, jamais écrits en dur : la
// signature, qui manquait au déroulé, y est — elle suit CHAQUE paiement (CG
// art. 9), et l'oublier ici, c'était promettre un QR sans elle.
const ETAPES = [
  {
    n: '01',
    titre: 'Choisissez l’heure',
    texte: `Vous voyez les créneaux réellement libres, club par club. Le prix est affiché d’avance : ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} en heure creuse, ${prixCourt(REGLAGES_DEFAUT.peak_cents)} en heure pleine.`,
  },
  {
    n: '02',
    titre: 'Payez en une fois',
    texte: `La place est tenue ${REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes, le temps de régler. Pas de paiement fractionné, pas d’abonnement, pas d’engagement.`,
  },
  {
    n: '03',
    titre: 'Signez, puis entrez avec un QR',
    texte: `Après le paiement, vous signez à l’écran les documents du club ; votre QR s’ouvre ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau et ne fonctionne que dans le club réservé.`,
  },
] as const;

export default async function HomePage() {
  return (
    <>
      {/* Bascule à 40rem : c'est celle du voile vertical de l'accueil. */}
      <PrechargeVisuel fichier="hero-accueil" bascule="40rem" />
      <section className="hero" aria-label="Louer une salle">
        {/* Chaque ligne est un élément à part : c'est ce qui permet de les
            découvrir l'une après l'autre. Un `<br>` ne se cible pas. */}
        <h1 className="hero-titre">
          <span className="ligne">Louez une salle de boxe</span>
          <span className="ligne">
            <em>à l’heure, à Toulouse.</em>
          </span>
        </h1>
        <p className="hero-sous reponse">
          Vous avez le client, Boxing Center a la salle : cinq clubs à Toulouse
          et autour, {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure creuse,{' '}
          {prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure pleine, sans abonnement.
          Vous réservez en ligne, signez à l’écran, et votre QR ouvre le club{' '}
          {REGLAGES_DEFAUT.qr_early_minutes} minutes avant votre heure.
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

      {/* ── Libre maintenant — la preuve avant l'argumentaire ─────────────── */}
      <ProchainesHeures />

      {/* ── Pour qui — on nomme le visiteur dès la deuxième section ───────── */}
      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe bande">
          <div className="bande__texte">
            <p className="sur mono">Pour les coachs indépendants</p>
            <h2>Un lieu équipé pour coacher vos clients, sans abonnement.</h2>
            <p>
              Vous êtes éducateur, préparateur physique ou coach de boxe. Vous avez
              vos clients, votre méthode et votre matériel. Ce qui vous manque, c’est
              une salle équipée, quand vous en avez besoin — sans louer à l’année.
            </p>
            <p>
              Ici vous prenez une heure, dans le club qui vous arrange, et vous
              repartez. Pas d’abonnement, pas de bail, pas de caution. Tout ce
              qu’il faut savoir pour{' '}
              <Link href="/location-salle-coach-sportif-toulouse">
                louer une salle et y coacher vos clients à Toulouse
              </Link>
              , y compris ce que dit la loi, est réuni sur une seule page.
            </p>
            <Link className="lien-fleche" href="/comment-ca-marche">
              Le déroulé complet
            </Link>
          </div>
          <figure className="bande__image">
            <Image
              src="/visuels/section-coach.webp"
              alt="Un coach dans une salle Boxing Center"
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
          <h2>Ring, sacs, tatamis : trois surfaces de travail.</h2>
          <p className="intro">
            {TOTAL_RINGS} rings, des sacs lourds, des tatamis, une cage et un octogone,
            répartis entre les cinq clubs. Le détail, club par club, est sur la
            page{' '}
            <Link href="/location-salle-de-boxe-toulouse">location de salle de boxe à Toulouse</Link>.
          </p>
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

      {/* ── Les clubs — voir le lieu avant de choisir l'heure ─────────────── */}
      <section className="section section--encre section--vitrine" data-polarite="encre">
        <div className="enveloppe">
          <div className="vitrine-clubs__entete">
            <div>
              <p className="sur mono">Cinq vrais lieux de travail</p>
              <h2>Choisissez la salle qui sert votre séance.</h2>
            </div>
            <p className="intro">
              Ring, sacs, tatamis, cage ou octogone&nbsp;: regardez l’espace, puis
              ouvrez son planning. Les photos montrent les clubs réels et les
              équipements annoncés viennent de leurs pages officielles.
            </p>
          </div>

          <div className="vitrine-clubs">
            {CLUB_PAGES.map((c) => {
              const clubId = c.clubId as ClubId;
              const club = CLUBS_VERITE[clubId];
              const photo = PHOTOS_CLUBS[clubId];
              const espaces = ESPACES_PAR_CLUB[clubId] ?? [];
              const nomsEspaces = espaces.map((espace) => NOM_ESPACE[espace] ?? espace);

              return (
                <article className="vitrine-club" data-club={clubId} key={c.slug}>
                  <Link
                    className="vitrine-club__visuel"
                    href={`/clubs/${c.slug}`}
                    aria-label={`Voir le planning du club ${c.nom}`}
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      width={1200}
                      height={750}
                      sizes="(min-width: 70rem) 34vw, (min-width: 48rem) 50vw, 100vw"
                    />
                    <span className="vitrine-club__cadrage mono">{photo.cadrage}</span>
                  </Link>
                  <div className="vitrine-club__corps">
                    <div className="vitrine-club__titre">
                      <div>
                        <p className="vitrine-club__ville mono">{club.ville}</p>
                        <h3>
                          <Link href={`/clubs/${c.slug}`}>{c.nom}</Link>
                        </h3>
                      </div>
                      <span className="vitrine-club__espaces mono">
                        {`${espaces.length} espace${espaces.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <p className="vitrine-club__preuve">{`${club.equipement.resume}.`}</p>
                    <address>{adresseEnLigne(club)}</address>
                    <p className="vitrine-club__zones mono">{nomsEspaces.join(' · ')}</p>
                    <Link className="vitrine-club__action" href={`/clubs/${c.slug}`}>
                      Voir les heures libres <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="vitrine-clubs__decision" aria-label="Décider avant de réserver">
            <div>
              <p className="sur mono">Décider sans mauvaise surprise</p>
              <h3>Une heure, un espace précis, un prix connu.</h3>
              <p>
                Le tarif est identique dans les cinq clubs&nbsp;: {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} en
                heure creuse ou {prixCourt(REGLAGES_DEFAUT.peak_cents)} en heure pleine. L’espace reste
                partagé avec les adhérents du club et le planning vous montre les cours avant le paiement.
              </p>
            </div>
            <Link className="btn btn-primary" href="/clubs">
              Comparer les cinq clubs
            </Link>
          </aside>
        </div>
      </section>

      {/* ── Le déroulé ────────────────────────────────────────────────────── */}
      <section className="section">
        <div className="enveloppe">
          <p className="sur mono">Trois temps, un QR</p>
          <h2>Réserver, payer, signer, entrer : le déroulé.</h2>
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
              src="/visuels/section-duo.webp"
              alt="Un coach et son client dans une salle Boxing Center"
              width={1200}
              height={800}
              sizes="(min-width: 60rem) 46vw, 100vw"
            />
          </figure>
          <div className="bande__texte">
            <p className="sur mono">Ce qu’il faut savoir avant</p>
            <h2>Les règles de réservation, en cinq lignes.</h2>
            <ul className="regles">
              <li>
                <b>Une heure</b>, du lundi au samedi, de 10 h à 19 h.
              </li>
              <li>
                <b>Deux coachs maximum</b> par espace et par heure, chacun avec un
                seul client ; l’espace reste partagé avec les adhérents du club.
              </li>
              <li>
                <b>Trois réservations</b> en cours au maximum.
              </li>
              <li>
                <b>Annulation jusqu’à 24 h avant</b> : vous recevez un avoir
                réutilisable. En dessous, le créneau est dû.
              </li>
              <li>
                <b>Les heures de cours du club</b> (anglaise, MMA, boxe
                éducative…) suivent le planning réel de chaque salle : elles
                s’affichent « Cours du club », toutes les autres se réservent.
              </li>
            </ul>
            <Link className="lien-fleche" href="/location-salle-de-sport-a-l-heure-toulouse">
              Ce que coûte une semaine de coaching, calculé
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
      <JsonLd data={[serviceJsonLd(), pageWebJsonLd('/', { surLeService: true, sansFil: true })]} />
    </>
  );
}
