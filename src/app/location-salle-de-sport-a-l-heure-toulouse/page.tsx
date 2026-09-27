import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import { CLUBS_VERITE, REGISTRE_VERIFIE_LE, RESEAU, type Source } from '@/lib/seo/verite'
import {
  HEURES_CREUSES,
  HEURES_PLEINES,
  REGLAGES_DEFAUT,
  prixCourt,
} from '@/domain/contrat'

const CHEMIN = '/location-salle-de-sport-a-l-heure-toulouse'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * « LOCATION SALLE DE SPORT À L'HEURE » — Toulouse.
 *
 * Requête relevée trois fois dans l'autocomplétion de Google le 27/09/2026,
 * sous trois formes. C'est l'intention du MODÈLE de prix : quelqu'un qui ne
 * veut pas d'abonnement et veut savoir ce que coûte une heure.
 *
 * L'ANGLE DE CETTE PAGE : LE CALCUL. Ce que coûtent une semaine et un mois de
 * coaching, selon l'heure choisie. Chaque montant est DÉRIVÉ des deux tarifs du
 * domaine — aucun n'est tapé à la main. Si un tarif change, toute la page suit,
 * et aucun chiffre publié ne peut contredire la grille réelle.
 *
 * Les chiffres précis sont ce qui fait citer une page (+33 % de visibilité
 * mesurée, Aggarwal et al., KDD 2024). Encore faut-il qu'ils soient vrais :
 * c'est pour ça qu'ils sont calculés, pas rédigés.
 */

const MIS_A_JOUR = '2026-09-27'
const C = REGLAGES_DEFAUT.offpeak_cents
const P = REGLAGES_DEFAUT.peak_cents
const f = prixCourt

const plage = (h: number) => `${h} h-${h + 1} h`

/** Les scénarios de calcul. Montants dérivés, jamais saisis. */
const SCENARIOS = [
  { libelle: '1 séance par semaine, heure creuse', semaine: C },
  { libelle: '3 séances par semaine, heure creuse', semaine: 3 * C },
  { libelle: '3 séances par semaine, heure pleine', semaine: 3 * P },
  { libelle: '2 creuses + 2 pleines par semaine', semaine: 2 * C + 2 * P },
  { libelle: '5 séances par semaine, heure creuse', semaine: 5 * C },
] as const

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Y a-t-il un nombre minimum d’heures à réserver ?',
    reponse:
      'Non. Vous pouvez réserver une seule heure, une fois, sans engagement pour la suite. Il n’y a ni forfait ni carnet à acheter d’avance.',
  },
  {
    question: 'Peut-on réserver deux heures d’affilée ?',
    reponse:
      'Oui : chaque heure est un créneau distinct, vous en réservez deux qui se suivent. Elles comptent pour deux dans la limite de trois réservations en cours.',
  },
  {
    question: 'Le prix peut-il changer après la réservation ?',
    reponse:
      'Non. Le montant est fixé au moment où vous réservez et ne bouge plus, même si la grille évolue ensuite.',
  },
  {
    question: 'Faut-il verser une caution ou des frais d’inscription ?',
    reponse:
      'Non. L’inscription est gratuite, et il n’y a ni caution ni frais de dossier. Vous ne payez que les heures réservées.',
  },
  {
    question: 'Peut-on payer une heure avec un avoir ?',
    reponse:
      'Oui. Un avoir obtenu en annulant plus de 24 heures avant un créneau se déduit de votre prochaine réservation, dans n’importe quel club.',
  },
  {
    question: 'Les tarifs sont-ils les mêmes dans les cinq clubs ?',
    reponse: `Oui. Le prix dépend uniquement de l’heure : ${f(C)} en heure creuse, ${f(P)} en heure pleine, quel que soit le club ou l’espace choisi.`,
  },
]

const SOURCES: readonly Source[] = [
  RESEAU.siteOfficiel,
  ...Object.values(CLUBS_VERITE).flatMap((c) => c.sources),
]

export default function Page() {
  const dateMaj = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(MIS_A_JOUR))
  const heures = [...HEURES_CREUSES, ...HEURES_PLEINES].sort((a, b) => a - b)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="a-l-heure">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Location de salle de sport à l’heure
        </p>
        <h1>Louer une salle de sport à l’heure à Toulouse : ce que ça coûte</h1>
        <p className="reponse">
          Une heure de salle coûte {f(C)} en heure creuse et {f(P)} en heure pleine
          dans les cinq clubs Boxing Center de l’agglomération toulousaine. Trois
          séances par semaine en heure creuse reviennent à {f(3 * C)} par semaine,
          sans abonnement ni frais d’inscription.
        </p>
        <p className="maj">
          Mis à jour le <time dateTime={MIS_A_JOUR}>{dateMaj}</time>
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Le prix de chaque heure, de 10 h à 19 h</h2>
          <p className="intro">
            Neuf créneaux d’une heure par jour, du lundi au samedi. Le prix ne
            dépend que de l’heure de début.
          </p>
          <div className="comparatif">
            <table>
              <caption>Grille appliquée dans les cinq clubs, du lundi au samedi.</caption>
              <thead>
                <tr>
                  <th scope="col">Créneau</th>
                  <th scope="col">Prix</th>
                  <th scope="col">Type d’heure</th>
                </tr>
              </thead>
              <tbody>
                {heures.map((h) => {
                  const creuse = (HEURES_CREUSES as readonly number[]).includes(h)
                  return (
                    <tr key={h}>
                      <th scope="row">{plage(h)}</th>
                      <td>{f(creuse ? C : P)}</td>
                      <td>{creuse ? 'Heure creuse' : 'Heure pleine'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Ce que coûte une semaine de coaching, calculé</h2>
          <p>
            Les montants ci-dessous sont calculés à partir de la grille, pas
            arrondis : quatre semaines, c’est quatre fois la semaine.
          </p>
          <div className="comparatif">
            <table>
              <caption>Exemples de rythmes réguliers, sur une semaine et sur quatre semaines.</caption>
              <thead>
                <tr>
                  <th scope="col">Rythme</th>
                  <th scope="col">Par semaine</th>
                  <th scope="col">Sur 4 semaines</th>
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((s) => (
                  <tr key={s.libelle}>
                    <th scope="row">{s.libelle}</th>
                    <td>{f(s.semaine)}</td>
                    <td>{f(s.semaine * 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Heure creuse ou heure pleine : laquelle choisir</h2>
          <p>
            L’écart est de {f(P - C)} par heure. Sur trois séances hebdomadaires,
            passer vos créneaux en heure creuse économise {f(3 * (P - C))} par
            semaine, soit {f(12 * (P - C))} sur quatre semaines.
          </p>
          <div className="comparatif">
            <table>
              <caption>Les deux plages, côte à côte.</caption>
              <thead>
                <tr>
                  <th scope="col">Critère</th>
                  <th scope="col">Heure creuse</th>
                  <th scope="col">Heure pleine</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Prix de l’heure</th>
                  <td>{f(C)}</td>
                  <td>{f(P)}</td>
                </tr>
                <tr>
                  <th scope="row">Horaires</th>
                  <td>10 h-12 h et 14 h-17 h</td>
                  <td>12 h-14 h et 17 h-19 h</td>
                </tr>
                <tr>
                  <th scope="row">Pour quels clients</th>
                  <td>Indépendants, retraités, horaires décalés</td>
                  <td>Salariés à la pause de midi ou en sortie de bureau</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Pas d’abonnement, pas de caution, pas de frais d’inscription</h2>
          <p>
            Vous payez l’heure que vous réservez, et rien d’autre. Aucun mois ne vous
            est facturé si vous ne coachez pas, et l’inscription est gratuite. C’est
            la différence avec une salle classique, où l’abonnement court que vous
            veniez ou non.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Trois réservations en cours, pas davantage</h2>
          <p>
            Vous pouvez tenir jusqu’à trois créneaux réservés à la fois. Dès qu’une
            séance est passée, une place se libère. La limite existe pour qu’aucun
            coach ne bloque la semaine des autres.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Une heure annulée à temps devient un avoir</h2>
          <p>
            Plus de 24 heures avant le créneau, l’annulation vous rend un avoir du
            montant payé, utilisable sur n’importe quelle autre heure. Une heure
            creuse annulée à temps finance donc une autre heure creuse, ou couvre
            les deux tiers d’une heure pleine.
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur le prix à l’heure" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Choisissez votre heure</h2>
          <p>
            Pour savoir qui a le droit de coacher en salle et où se trouvent les
            clubs, voir{' '}
            <Link href="/location-salle-coach-sportif-toulouse">
              la location de salle pour coach sportif
            </Link>
            .
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/tarifs">
              Tarifs et avoirs en détail
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
            { name: 'Location de salle de sport à l’heure', path: CHEMIN },
          ]),
        ]}
      />
    </>
  )
}
