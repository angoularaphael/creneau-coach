import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { Sources } from '@/components/aeo/Sources'
import { CLUB_PAGES, metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import {
  CLUBS_VERITE,
  COMPARAISON,
  LOI,
  MARCHE,
  REGISTRE_VERIFIE_LE,
  RESEAU,
  adresseEnLigne,
  type Source,
} from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'

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
 */

const MIS_A_JOUR = '2026-09-27'
const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)
const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Combien coûte la location d’une salle pour un coach sportif à Toulouse ?',
    reponse: `Chez Boxing Center, un créneau d’une heure coûte ${creuse} en heure creuse (10 h-12 h et 14 h-17 h) et ${pleine} en heure pleine (12 h-14 h et 17 h-19 h). Il n’y a ni abonnement, ni frais d’inscription, ni caution : vous payez l’heure réservée.`,
  },
  {
    question: 'Faut-il être diplômé pour louer une salle et y coacher ses clients ?',
    reponse: `Oui. L’article ${LOI.qualification.article} du Code du sport réserve l’encadrement rémunéré d’une activité physique aux titulaires d’un diplôme ou d’une qualification reconnue, et l’article ${LOI.declaration.article} impose de déclarer son activité. Vos justificatifs sont demandés une seule fois, à l’inscription.`,
  },
  {
    question: 'Mon client doit-il être adhérent du club ?',
    reponse:
      'Non. Vous réservez le créneau et vous entrez avec votre client — un client par réservation, en cours privé — et vous en restez responsable pendant l’heure. Il n’a pas besoin d’abonnement Boxing Center.',
  },
  {
    question: 'Serai-je seul dans la salle ?',
    reponse:
      'Pas forcément. Deux coachs au maximum partagent le même espace à la même heure, jamais davantage. Le nombre de places restantes est affiché avant que vous réserviez.',
  },
  {
    question: 'Puis-je annuler un créneau réservé ?',
    reponse:
      'Oui, jusqu’à 24 heures avant son début : vous recevez un avoir du même montant, utilisable sur n’importe quel autre créneau. Moins de 24 heures avant, le créneau reste dû.',
  },
  {
    question: 'Combien de créneaux puis-je réserver à l’avance ?',
    reponse:
      'Jusqu’à trois réservations en cours en même temps. Dès qu’une séance est passée, une place se libère pour la suivante.',
  },
  {
    question: 'Comment entre-t-on dans le club le jour du créneau ?',
    reponse:
      'Avec un QR code personnel, affiché dans votre espace coach. Il s’active cinq minutes avant l’heure réservée, se désactive à la fin, et n’ouvre que le club que vous avez réservé.',
  },
]

const SOURCES: readonly Source[] = [
  LOI.qualification.source,
  LOI.registrePublic,
  MARCHE.diplomesBpjeps.source,
  COMPARAISON.basicFit.source,
  RESEAU.siteOfficiel,
  ...Object.values(CLUBS_VERITE).flatMap((c) => c.sources),
]

export default function Page() {
  const clubs = Object.values(CLUBS_VERITE)
  const dateMaj = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(MIS_A_JOUR))

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="coach-sportif">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Location de salle pour coach sportif
        </p>
        <h1>Louer une salle pour coacher ses clients à Toulouse</h1>
        {/* LA RÉPONSE. Deux phrases qui tiennent seules : c'est ce qu'un moteur
            de réponse extrait, et ce qu'un coach pressé lit avant de décider. */}
        <p className="reponse">
          Boxing Center loue ses salles à l’heure aux coachs sportifs indépendants,
          dans cinq clubs de Toulouse et de son agglomération. Une heure coûte {creuse}{' '}
          en heure creuse et {pleine} en heure pleine, sans abonnement ni engagement.
        </p>
        <p className="maj">
          Mis à jour le <time dateTime={MIS_A_JOUR}>{dateMaj}</time>
        </p>
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
              <caption>Tarifs appliqués du lundi au samedi, dans les cinq clubs.</caption>
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
                  <td>10 h-11 h, 11 h-12 h, 14 h-15 h, 15 h-16 h, 16 h-17 h</td>
                </tr>
                <tr>
                  <th scope="row">Heure pleine</th>
                  <td>{pleine}</td>
                  <td>12 h-13 h, 13 h-14 h, 17 h-18 h, 18 h-19 h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Pourquoi une salle classique ne suffit pas</h2>
          <p>
            Faire travailler un client dans une salle où l’on est simplement abonné
            n’est pas toujours permis. Le règlement intérieur de {COMPARAISON.basicFit.marque},
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
                  <td>Selon le règlement, souvent soumis à autorisation</td>
                  <td>Oui</td>
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
                  <td>Rarement un ring ou une cage</td>
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
          <h2>Deux coachs au plus par espace, jamais davantage</h2>
          <p>
            Chaque espace accueille au maximum deux coachs à la même heure. Vous
            voyez le nombre de places restantes avant de réserver, et un créneau
            complet ne s’affiche plus comme disponible. Chaque coach y vient avec
            un seul client : jamais plus de quatre personnes en séance privée sur
            le même espace.
          </p>
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
                <h3>Vous signez une fois pour toutes</h3>
                <p>Conditions, règlement du club et décharge, depuis votre téléphone.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous entrez avec votre QR code</h3>
                <p>Actif cinq minutes avant l’heure, valable dans le seul club réservé.</p>
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
          <h2>Annulation : un avoir jusqu’à 24 heures avant</h2>
          <p>
            Un empêchement plus de 24 heures avant le créneau ? Vous annulez depuis
            votre espace et recevez un avoir du même montant, réutilisable sur
            n’importe quel autre créneau, dans n’importe quel club. En dessous de
            24 heures, le créneau reste dû : la place ne peut plus être proposée à
            un autre coach à temps.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Chaque année, des milliers de coachs diplômés cherchent où exercer</h2>
          <p>
            {MARCHE.diplomesBpjeps.texte} {MARCHE.mentionsForme.texte} Autrement
            dit, la moitié des nouveaux diplômés exercent un métier qui a besoin
            d’une salle — sans forcément en avoir une.
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

      <Faq items={QUESTIONS} />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Regardez les heures libres cette semaine</h2>
          <p>Aucun compte n’est nécessaire pour consulter les créneaux des cinq clubs.</p>
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

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} />

      <JsonLd
        data={[
          serviceJsonLd(),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Location de salle pour coach sportif', path: CHEMIN },
          ]),
        ]}
      />
    </>
  )
}
