import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { Fondement } from '@/components/aeo/Fondement'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { CLUB_PAGES, metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { pageWebJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import {
  CLUBS_VERITE,
  COMPARAISON,
  LOI,
  MARCHE,
  REGISTRE_VERIFIE_LE,
  REGLES,
  RESEAU,
  adresseEnLigne,
  plagesHoraires,
  type Source,
} from '@/lib/seo/verite'
import { HEURES_CREUSES, HEURES_PLEINES, REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'

const CHEMIN = '/location-salle-coach-sportif-toulouse'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * « LOCATION DE SALLE POUR COACH SPORTIF » — Toulouse.
 *
 * La requête est relevée telle quelle dans l'autocomplétion de Google le
 * 27/09/2026. C'est l'intention cœur du produit, mot pour mot.
 *
 * L'ANGLE DE CETTE PAGE, et c'est lui qui la distingue de ses trois sœurs :
 * le CADRE. Où a-t-on le droit de faire travailler ses clients, sous quelle
 * condition légale, et pourquoi une salle classique ne suffit pas. Les prix y
 * sont, mais le calcul détaillé vit sur la page « à l'heure » ; l'équipement de
 * combat, sur la page « salle de boxe ». Trois pages qui disent la même chose
 * se replient en une seule dans l'index.
 *
 * Tout fait vient de `src/lib/seo/verite.ts`. Rien n'est écrit ici en dur qui
 * existe là-bas.
 *
 * ── CORRIGÉ LE 02/10/2026 ─────────────────────────────────────────────
 *
 * · « Vous signez une fois pour toutes » : faux, la signature suit CHAQUE
 *   paiement (CG art. 9). « Vos justificatifs sont demandés une seule fois » :
 *   inexact, le contrat permet de les demander à tout moment, sous huit jours
 *   (CG art. 5.2). « Serai-je seul ? Deux coachs au plus » : incomplet, l'espace
 *   reste partagé avec les adhérents et le personnel (CG art. 3.3).
 * · « Chaque année, des milliers de coachs cherchent où exercer » : l'INJEP
 *   mesure UNE promotion, et ne dit rien de ce que ses diplômés cherchent. Le
 *   H2 dit maintenant le chiffre, et le texte n'en tire que l'arithmétique
 *   (26 % + 25 % = un sur deux).
 * · Le tableau comparatif affirmait qu'une salle classique a « rarement un ring
 *   ou une cage » et que coacher y est « souvent soumis à autorisation » : deux
 *   généralités sans source. Il cite maintenant le seul règlement vérifié, et
 *   dit « selon la salle » pour le reste.
 * · Les heures de cours du club, absentes de la page, y sont.
 * · Les plages horaires étaient tapées à la main dans le tableau et la FAQ :
 *   elles sont lues dans `HEURES_CREUSES` / `HEURES_PLEINES`.
 */

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)
const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug
const heureParHeure = (heures: readonly number[]) =>
  heures.map((h) => `${h} h-${h + 1} h`).join(', ')

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Combien coûte la location d’une salle pour un coach sportif à Toulouse ?',
    reponse: `Chez Boxing Center, un créneau d’une heure coûte ${creuse} en heure creuse (${plagesHoraires(HEURES_CREUSES)}) et ${pleine} en heure pleine (${plagesHoraires(HEURES_PLEINES)}), dans les cinq clubs. Vous payez l’heure réservée, et rien d’autre : ni abonnement, ni frais d’inscription, ni caution.`,
  },
  {
    question: 'Faut-il être diplômé pour louer une salle et y coacher ses clients ?',
    reponse: `Oui. L’article ${LOI.qualification.article} du Code du sport réserve l’encadrement rémunéré d’une activité physique aux titulaires d’un diplôme ou d’une qualification reconnue, et l’article ${LOI.declaration.article} impose de déclarer son activité. ${REGLES.justificatifs.texte}`,
  },
  {
    question: 'Mon client doit-il être adhérent du club ?',
    reponse:
      'Non. Vous réservez le créneau et vous entrez avec votre client — un client par réservation, en cours privé — et vous en restez responsable pendant l’heure. Il n’a pas besoin d’abonnement Boxing Center.',
  },
  {
    question: 'Serai-je seul dans la salle ?',
    reponse: `Pas forcément. ${REGLES.partage.texte} Le nombre de places restantes s’affiche avant que vous réserviez.`,
  },
  {
    question: 'Puis-je annuler un créneau réservé ?',
    reponse:
      'Oui, jusqu’à 24 heures avant son début : vous recevez un avoir du même montant, utilisable sur n’importe quel autre créneau. Moins de 24 heures avant, le créneau reste dû.',
  },
  {
    question: 'Combien de réservations puis-je tenir en même temps ?',
    reponse: REGLES.limite.texte,
  },
  {
    question: 'Comment entre-t-on dans le club le jour du créneau ?',
    reponse: `Avec un QR code personnel, affiché dans votre espace coach dès que vous avez signé les documents de la réservation. ${REGLES.qr.texte}`,
  },
]

const SOURCES: readonly Source[] = [
  REGLES.qualification.source,
  REGLES.partage.source,
  REGLES.signature.source,
  REGLES.coursDuClub.source,
  LOI.qualification.source,
  LOI.registrePublic,
  MARCHE.diplomesBpjeps.source,
  COMPARAISON.basicFit.source,
  RESEAU.siteOfficiel,
  ...Object.values(CLUBS_VERITE).flatMap((c) => c.sources),
]

export default function Page() {
  const clubs = Object.values(CLUBS_VERITE)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="coach-sportif">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Location de salle pour coach sportif', path: CHEMIN },
          ]}
        />
        <h1>Louer une salle pour coacher ses clients à Toulouse</h1>
        {/* LA RÉPONSE. Deux phrases qui tiennent seules : c'est ce qu'un moteur
            de réponse extrait, et ce qu'un coach pressé lit avant de décider.
            Elles répondent aux deux moitiés de la question de la route : où,
            et à quelles conditions. */}
        <p className="reponse">
          Boxing Center loue ses salles à l’heure aux coachs sportifs indépendants dans cinq
          clubs de Toulouse et de son agglomération, à {creuse} l’heure creuse et {pleine}{' '}
          l’heure pleine, sans abonnement. Il faut être un coach diplômé, déclaré et assuré, et
          chaque réservation couvre un client en cours privé.
        </p>
        <MisAJour chemin={CHEMIN} />
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Cinq clubs équipés, dans Toulouse et autour</h2>
          <p className="intro">
            Chaque club se réserve séparément, et votre accès n’ouvre que celui que
            vous avez choisi. Les adresses et l’équipement ci-dessous sont ceux que
            publie le réseau Boxing Center.
          </p>
          <ul className="clubs-faits">
            {clubs.map((c) => {
              const slug = slugDe(c.id)
              return (
                <li key={c.id}>
                  <h3>{c.nom.replace('Boxing Center ', '')}</h3>
                  <address>{adresseEnLigne(c)}</address>
                  <p>Sur place : {c.equipement.resume}.</p>
                  {c.acces ? <p>{c.acces.texte}</p> : null}
                  {slug ? (
                    <Link href={`/clubs/${slug}`}>Voir les créneaux libres à {c.ville === 'Toulouse' ? c.nom.replace('Boxing Center Toulouse ', '') : c.ville}</Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Une heure coûte {creuse} ou {pleine}, rien de plus</h2>
          <p>
            Le prix dépend de l’heure, jamais du club ni de l’espace. Il s’affiche
            avant le paiement et ne bouge plus une fois le créneau réservé. Le
            détail du calcul à la semaine et au mois est sur la page{' '}
            <Link href="/location-salle-de-sport-a-l-heure-toulouse">location de salle de sport à l’heure</Link>.
          </p>
          <div className="comparatif">
            <table>
              <caption>Tarifs appliqués du lundi au samedi, dans les cinq clubs, toutes taxes comprises.</caption>
              <thead>
                <tr>
                  <th scope="col">Plage horaire</th>
                  <th scope="col">Prix d’une heure</th>
                  <th scope="col">Créneaux concernés</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Heure creuse</th>
                  <td>{creuse}</td>
                  <td>{heureParHeure(HEURES_CREUSES)}</td>
                </tr>
                <tr>
                  <th scope="row">Heure pleine</th>
                  <td>{pleine}</td>
                  <td>{heureParHeure(HEURES_PLEINES)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>{REGLES.coursDuClub.texte}</p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Salle louée, abonnement ou plein air : où coacher ses clients</h2>
          <p>
            Faire travailler un client dans une salle où l’on est simplement abonné
            dépend du règlement de cette salle. Celui de {COMPARAISON.basicFit.marque},
            par exemple, l’écrit en toutes lettres :
          </p>
          <blockquote className="citation" cite={COMPARAISON.basicFit.source.url}>
            <p>« {COMPARAISON.basicFit.citation} »</p>
            <footer>
              —{' '}
              <a href={COMPARAISON.basicFit.source.url} rel="noopener" target="_blank">
                {COMPARAISON.basicFit.source.libelle}
              </a>
            </footer>
          </blockquote>
          <div className="comparatif">
            <table>
              <caption>
                Comparaison des façons d’exercer quand on n’a pas de salle à soi.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Critère</th>
                  <th scope="col">Salle louée à l’heure</th>
                  <th scope="col">Abonnement en salle de sport</th>
                  <th scope="col">En extérieur ou à domicile</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Droit d’y coacher un client</th>
                  <td>Oui, c’est l’objet de la location</td>
                  <td>Selon le règlement ; chez {COMPARAISON.basicFit.marque}, autorisation écrite préalable</td>
                  <td>Oui</td>
                </tr>
                <tr>
                  <th scope="row">Ce que coûte une séance</th>
                  <td>{creuse} ou {pleine}, l’heure réservée</td>
                  <td>L’abonnement du mois, divisé par vos séances</td>
                  <td>Rien</td>
                </tr>
                <tr>
                  <th scope="row">Coût fixe mensuel</th>
                  <td>Aucun</td>
                  <td>L’abonnement, que vous coachiez ou non</td>
                  <td>Aucun</td>
                </tr>
                <tr>
                  <th scope="row">Ring, sacs, tatamis</th>
                  <td>Oui, selon le club</td>
                  <td>Selon la salle</td>
                  <td>À transporter vous-même</td>
                </tr>
                <tr>
                  <th scope="row">Dépend de la météo</th>
                  <td>Non</td>
                  <td>Non</td>
                  <td>Oui</td>
                </tr>
                <tr>
                  <th scope="row">Accès du client</th>
                  <td>Avec vous, sans adhésion</td>
                  <td>Selon le règlement de la salle</td>
                  <td>Libre</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>La carte professionnelle est obligatoire pour coacher contre rémunération</h2>
          <p>
            Ce n’est pas une règle du club : c’est la loi. L’article {LOI.qualification.article}{' '}
            du Code du sport dispose que :
          </p>
          <blockquote className="citation" cite={LOI.qualification.source.url}>
            <p>« {LOI.qualification.citation}. »</p>
            <footer>
              — Code du sport, article {LOI.qualification.article},{' '}
              <a href={LOI.qualification.source.url} rel="noopener" target="_blank">
                Légifrance
              </a>
            </footer>
          </blockquote>
          <p>
            Encadrer sans cette qualification est puni de {LOI.sanctionQualification.texte}{' '}
            (article {LOI.sanctionQualification.article}), et ne pas déclarer son
            activité, de la même peine (article {LOI.sanctionDeclaration.article}).
            C’est pour cela que vos justificatifs vous sont demandés à l’inscription.
            N’importe qui peut vérifier une carte sur le{' '}
            <a href={LOI.registrePublic.url} rel="noopener" target="_blank">
              registre public du ministère des Sports
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Deux coachs au plus par espace, chacun avec un client</h2>
          <p>
            {REGLES.partage.texte} Vous voyez le nombre de places restantes avant de
            réserver, et un créneau complet ne s’affiche plus comme disponible. Chaque
            coach y vient avec un seul client : jamais plus de quatre personnes en séance
            privée sur le même espace.
          </p>
          <Fondement regle={REGLES.partage} />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>De la réservation à la porte du club, en quatre temps</h2>
          <ol className="etapes-aeo">
            <li>
              <div>
                <h3>Vous choisissez l’heure</h3>
                <p>Sur la page du club, jour par jour et espace par espace.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous payez en une fois</h3>
                <p>La place vous est gardée dix minutes, le temps du paiement par carte.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous signez à l’écran</h3>
                <p>Conditions, règlement du club et décharge, juste après chaque paiement.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous entrez avec votre QR code</h3>
                <p>Actif {REGLAGES_DEFAUT.qr_early_minutes} minutes avant l’heure, valable dans le seul club réservé.</p>
              </div>
            </li>
          </ol>
          <p style={{ marginTop: '1.25rem' }}>
            <Link className="lien-fleche" href="/comment-ca-marche">
              Le déroulé complet, étape par étape
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Annulation : un avoir jusqu’à {REGLAGES_DEFAUT.cancel_min_hours} heures avant</h2>
          <p>
            {REGLES.annulation.texte} L’avoir est valable sans limite de durée, dans
            n’importe quel club. En dessous de {REGLAGES_DEFAUT.cancel_min_hours} heures,
            la place ne peut plus être proposée à un autre coach à temps.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>BPJEPS : {MARCHE.diplomesBpjeps.valeur} nouveaux éducateurs sportifs en un an</h2>
          <p>
            {MARCHE.diplomesBpjeps.texte} {MARCHE.mentionsForme.texte} Ensemble, ces
            deux mentions réunissent un nouveau diplômé sur deux.
          </p>
          <p className="muted">
            Source :{' '}
            <a href={MARCHE.diplomesBpjeps.source.url} rel="noopener" target="_blank">
              {MARCHE.diplomesBpjeps.source.libelle}
            </a>
            .
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions des coachs sur la location de salle" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Regardez les heures libres des cinq clubs</h2>
          <p>
            Aucun compte n’est nécessaire pour consulter les créneaux des cinq clubs. Les
            conditions pour coacher dans les clubs sont détaillées sur{' '}
            <Link href="/devenir-coach-partenaire">devenir coach partenaire</Link>.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/auth/inscription">
              Créer mon compte coach
            </Link>
          </div>
        </div>
      </section>

      <Sources
        items={SOURCES}
        verifieLe={REGISTRE_VERIFIE_LE}
        titre="Les sources : Code du sport, INJEP, contrat et clubs"
      />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </>
  )
}
