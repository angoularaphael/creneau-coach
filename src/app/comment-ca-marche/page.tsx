import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Comment réserver une salle',
  description:
    'Réserver une heure de salle chez Boxing Center : choisir son créneau, payer, signer, entrer avec son QR. Le déroulé complet, sans surprise.',
};

/**
 * Comment ça marche.
 *
 * La page tenait en trois encadrés minuscules disant « Hold 10 minutes » et
 * « Paiement 1× ». Deux problèmes : c'était du vocabulaire d'ingénieur, et
 * c'était vide — un visiteur qui hésite n'y trouvait aucune raison de continuer.
 *
 * Elle répond maintenant, dans l'ordre, aux vraies questions : combien ça coûte,
 * qui peut réserver, ce qui se passe si j'annule, comment j'entre dans le club.
 * Et chaque réponse ouvre sur la page qui la détaille.
 */

const ETAPES = [
  {
    n: '01',
    titre: 'Vous choisissez votre heure',
    texte:
      'Sur la page d’un club, vous voyez ce qui est libre, jour par jour et espace par espace. Un créneau dure une heure. Le prix s’affiche avant que vous ne cliquiez : 10 € en heure creuse, 15 € en heure pleine.',
    aside: 'Du lundi au samedi, de 10 h à 19 h.',
  },
  {
    n: '02',
    titre: 'Vous payez en une fois',
    texte:
      'La place vous est gardée dix minutes, le temps de régler par carte. Il n’y a pas de paiement en plusieurs fois, pas d’abonnement et pas de caution : vous payez cette heure-là, et rien d’autre.',
    aside: 'Carte bancaire ou avoir existant.',
  },
  {
    n: '03',
    titre: 'Vous signez une fois pour toutes',
    texte:
      'Avant votre première séance, vous signez en ligne les conditions, le règlement du club et la décharge. C’est fait en deux minutes, depuis votre téléphone, et vous les retrouvez ensuite dans votre espace.',
    aside: 'Signature directement à l’écran.',
  },
  {
    n: '04',
    titre: 'Vous entrez avec votre QR',
    texte:
      'Votre code d’accès apparaît dans votre espace. Il s’active cinq minutes avant votre créneau et s’éteint à la fin. Il n’ouvre que le club que vous avez réservé — pas les autres.',
    aside: 'Rien à imprimer, rien à retirer à l’accueil.',
  },
] as const;

const QUESTIONS = [
  {
    q: 'Faut-il être coach diplômé ?',
    r: 'Oui. Ces créneaux sont réservés aux professionnels qui encadrent leur propre clientèle. Vos justificatifs sont demandés une seule fois, à l’inscription.',
  },
  {
    q: 'Puis-je venir avec plusieurs clients ?',
    r: 'Oui, dans la limite de ce que l’espace permet. Vous restez responsable des personnes que vous faites entrer, et elles n’ont pas besoin d’être adhérentes du club.',
  },
  {
    q: 'Et si j’annule ?',
    r: 'Jusqu’à 24 heures avant, vous recevez un avoir réutilisable sur n’importe quel autre créneau. En dessous de 24 heures, le créneau reste dû — la place n’est plus reloouable à temps.',
  },
  {
    q: 'Serai-je seul dans la salle ?',
    r: 'Pas forcément. Deux coachs au maximum partagent le même espace à la même heure, jamais plus. Vous voyez combien de places restent avant de réserver.',
  },
  {
    q: 'Puis-je réserver plusieurs créneaux d’avance ?',
    r: 'Oui, jusqu’à trois réservations en cours en même temps. Dès qu’une séance est passée, une place se libère.',
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div data-geste="rebond">
      <header className="page-hero page-hero--visuel" data-visuel="comment-ca-marche">
        <p className="sur mono">En quatre étapes</p>
        <h1>De la recherche d’une salle à la porte du club</h1>
        <p className="page-hero__sous">
          Vous réservez une heure, vous payez, vous signez une fois, vous entrez.
          Voilà ce qui se passe entre les deux.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <ol className="deroule">
            {ETAPES.map((e) => (
              <li className="deroule__item" key={e.n}>
                <span className="deroule__n mono">{e.n}</span>
                <div className="deroule__corps">
                  <h2>{e.titre}</h2>
                  <p>{e.texte}</p>
                  <p className="deroule__aside mono">{e.aside}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe bande">
          <div className="bande__texte">
            <p className="sur mono">Sur place</p>
            <h2>Vous arrivez, la salle est prête.</h2>
            <p>
              Ring monté, sacs accrochés, tapis dégagé. Vous n’avez rien à installer
              et rien à ranger : vous entrez à l’heure, vous travaillez, vous repartez.
            </p>
            <Link className="lien-fleche" href="/clubs">
              Voir les clubs et leurs espaces
            </Link>
          </div>
          <figure className="bande__image">
            <Image
              src="/photos/salle-hero-1200.webp"
              alt="L’allée des sacs et le ring, Boxing Center Minimes"
              width={1200}
              height={800}
              sizes="(min-width: 60rem) 46vw, 100vw"
            />
          </figure>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <p className="sur mono">Les questions qu’on nous pose</p>
          <h2>Ce que les coachs demandent avant de réserver.</h2>
          <dl className="faq">
            {QUESTIONS.map((x) => (
              <div className="faq__item" key={x.q}>
                <dt>{x.q}</dt>
                <dd>{x.r}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Il reste des heures cette semaine.</h2>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/tarifs">
              Consulter les tarifs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
