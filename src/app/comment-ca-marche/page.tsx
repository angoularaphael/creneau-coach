import Image from 'next/image'
import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { Fondement } from '@/components/aeo/Fondement'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import {
  derouleJsonLd,
  pageWebJsonLd,
  serviceJsonLd,
  type EtapeVisible,
  type QuestionReponse,
} from '@/lib/seo/jsonld'
import { REGISTRE_VERIFIE_LE, REGLES, RESEAU, type Source } from '@/lib/seo/verite'
import { DERNIERE_HEURE_DEBUT, PREMIERE_HEURE, REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'
import '@/styles/contenu.css'

const CHEMIN = '/comment-ca-marche'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * COMMENT ÇA MARCHE — le déroulé d'une réservation, de la grille à la porte.
 *
 * ── TROIS PHRASES FAUSSES, RETIRÉES LE 02/10/2026 ──────────────────────
 *
 * 1. « Vous signez une fois pour toutes. » Le contrat dit l'inverse : les
 *    documents en vigueur se signent après CHAQUE paiement (CG art. 9.1) et la
 *    réservation reste « à signer » tant que ce n'est pas fait
 *    (`src/lib/dal/paiements.ts`). Un coach qui l'aurait cru se serait
 *    retrouvé devant la porte sans QR.
 * 2. « Rien à installer et rien à ranger. » Le règlement demande de remettre
 *    l'équipement du club en place (RI art. 4.4). On vend ce qui est vrai :
 *    rien à installer.
 * 3. « Il reste des heures cette semaine. » Personne ne le vérifiait : une
 *    semaine pleine aurait affiché une promesse fausse au-dessus du bouton.
 *
 * ── CE QUI MANQUAIT À LA PAGE ──────────────────────────────────────────
 *
 * Un H1 qui porte la question (« De la recherche d'une salle à la porte du
 * club » ne contenait ni « réserver » ni « Toulouse »), un chapeau de deux
 * phrases, une FAQ BALISÉE (elle était visible en `<dl>`, sans `FAQPage` :
 * la forme la plus citée, perdue), un fil d'Ariane, une date, des sources.
 *
 * Le geste « rebond » (`data-geste`) est celui qu'Eddy a demandé pour cette
 * page : le texte rebondit deux fois puis se pose. Conservé tel quel.
 */

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)

/** Les étapes : la même liste nourrit l'écran ET le nœud `HowTo`. */
const ETAPES: readonly (EtapeVisible & { n: string; aside: string })[] = [
  {
    n: '01',
    titre: 'Choisir une heure libre sur le planning du club',
    texte: `Sur la page d’un club, le planning montre ce qui est libre, jour par jour et espace par espace, avec le nombre de places restantes. Un créneau dure une heure et son prix s’affiche avant tout clic : ${creuse} en heure creuse, ${pleine} en heure pleine. Les heures marquées « Cours du club » suivent le planning de la salle et ne se réservent pas.`,
    aside: `Du lundi au samedi, de ${PREMIERE_HEURE} h à ${DERNIERE_HEURE_DEBUT + 1} h.`,
  },
  {
    n: '02',
    titre: 'Payer l’heure en ligne, en une fois',
    texte: `${REGLES.option.texte.replace(/^Pendant le paiement, l/, 'L')} Vous réglez par carte bancaire, ou avec un avoir s’il couvre tout le prix. La réservation est faite dès que le paiement est accepté.`,
    aside: 'Carte bancaire ou avoir.',
  },
  {
    n: '03',
    titre: 'Signer les trois documents à l’écran',
    texte:
      'Juste après le paiement, vous lisez puis signez les conditions générales, le règlement intérieur et la décharge de responsabilité : une case à cocher, puis votre signature tracée à l’écran ou votre nom saisi. L’attestation de signature reste téléchargeable dans votre espace.',
    aside: 'À chaque réservation, depuis votre téléphone.',
  },
  {
    n: '04',
    titre: 'Entrer au club avec votre QR code',
    texte: `Dès la signature, votre QR code apparaît dans votre espace coach. Il est à votre nom, s’active ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau, s’éteint à la fin, et n’ouvre que le club réservé. Vous entrez avec votre client.`,
    aside: 'Rien à imprimer, rien à retirer à l’accueil.',
  },
]

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Faut-il un compte pour voir les heures libres ?',
    reponse:
      'Non : le planning des cinq clubs est ouvert à tous, sans inscription. Le compte coach, gratuit, ne sert qu’au moment de réserver et de payer.',
  },
  {
    question: 'Mon client doit-il s’inscrire ou être adhérent ?',
    reponse:
      'Non. Seul le coach a un compte et un QR code ; votre client entre avec vous, pour une séance privée, sans abonnement au club. Il doit être majeur, sauf accord écrit préalable de Boxing Center pour un mineur.',
  },
  {
    question: 'Puis-je venir avec plusieurs clients ?',
    reponse:
      'Une réservation couvre un seul client, en cours privé. Pour un deuxième client, réservez une autre heure ou un autre espace.',
  },
  {
    question: 'Mon QR code ouvre-t-il les autres clubs ?',
    reponse:
      'Non : il n’ouvre que le club de la réservation, et seulement pendant le créneau. Pour coacher dans un autre club, vous réservez une heure dans ce club, et un nouveau QR code vous est délivré.',
  },
  {
    question: 'Que se passe-t-il si je n’ai pas signé avant le créneau ?',
    reponse: `${REGLES.sansSignature.texte} La signature se fait juste après le paiement, en une seule fois pour les trois documents.`,
  },
]

const SOURCES: readonly Source[] = [
  REGLES.grille.source,
  REGLES.option.source,
  REGLES.paiement.source,
  REGLES.qr.source,
  REGLES.signature.source,
  REGLES.annulation.source,
  REGLES.inscription.source,
  REGLES.equipement.source,
  REGLES.partage.source,
  RESEAU.siteOfficiel,
]

export default function HowItWorksPage() {
  return (
    <div data-geste="rebond">
      <header className="page-hero page-hero--visuel" data-visuel="comment-ca-marche">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Comment ça marche', path: CHEMIN },
          ]}
        />
        <h1>Comment réserver une salle à l’heure pour coacher à Toulouse</h1>
        <p className="reponse">
          Vous choisissez une heure libre sur le planning d’un des cinq clubs Boxing Center,
          vous la payez en ligne — {creuse} en heure creuse, {pleine} en heure pleine —, puis
          vous signez à l’écran les trois documents du club. Votre QR code d’accès apparaît
          aussitôt dans votre espace coach et ouvre le club{' '}
          {REGLAGES_DEFAUT.qr_early_minutes} minutes avant votre heure.
        </p>
        <MisAJour chemin={CHEMIN} />
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
            <h2>Sur place, la salle est prête : vous n’installez rien</h2>
            <p>
              Le ring est monté, les sacs sont accrochés, les tapis sont en place. Vous arrivez
              avec l’équipement individuel — gants, bandes, protège-dents —, vous travaillez
              votre heure, et vous remettez le matériel du club à sa place en partant.
            </p>
            <p>{REGLES.partage.texte}</p>
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
          <h2>Avant la première heure : un compte coach gratuit</h2>
          <p>
            {REGLES.inscription.texte} Vous y renseignez votre profil professionnel, dont votre
            diplôme ; le contrat vous demande d’être déclaré, assuré et titulaire d’une carte
            professionnelle valide.
          </p>
          <p>
            <Link href="/devenir-coach-partenaire">Les conditions pour coacher dans les clubs, en détail</Link>
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Retard, empêchement, porte fermée : ce qui est prévu</h2>
          <ul className="regles">
            <li>
              <b>Un empêchement ?</b> {REGLES.annulation.texte}
            </li>
            <li>
              <b>Un retard ?</b> {REGLES.retard.texte}
            </li>
            <li>
              <b>La porte ne s’ouvre pas ?</b> {REGLES.accesImpossible.texte} Le réseau répond
              au {RESEAU.telephone.affiche}.
            </li>
          </ul>
          <Fondement regle={REGLES.accesImpossible} />
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Ce que les coachs demandent avant de réserver" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Choisissez votre club, puis votre heure</h2>
          <p>
            Une question précise — accès libre, avoir, client mineur ?{' '}
            <Link href="/faq">Les réponses, article par article du contrat</Link>.
          </p>
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

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} titre="Les sources du déroulé d’une réservation" />

      <JsonLd
        data={[
          serviceJsonLd(),
          pageWebJsonLd(CHEMIN, { surLeService: true }),
          derouleJsonLd('Réserver une salle Boxing Center à l’heure pour coacher', ETAPES),
        ]}
      />
    </div>
  )
}
