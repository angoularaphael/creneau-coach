import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { Fondement } from '@/components/aeo/Fondement'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { pageWebJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import {
  COMPARAISON,
  CLUBS_VERITE,
  REGISTRE_VERIFIE_LE,
  REGLES,
  RESEAU,
  plagesHoraires,
  type Source,
} from '@/lib/seo/verite'
import {
  DERNIERE_HEURE_DEBUT,
  HEURES_CREUSES,
  HEURES_PLEINES,
  PREMIERE_HEURE,
  REGLAGES_DEFAUT,
  prixCourt,
} from '@/domain/contrat'
import '@/styles/contenu.css'

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
 * coaching, selon l'heure choisie, et le calcul qui départage l'heure et
 * l'abonnement. Chaque montant est DÉRIVÉ des deux tarifs du domaine — aucun
 * n'est tapé à la main. Si un tarif change, toute la page suit, et aucun
 * chiffre publié ne peut contredire la grille réelle.
 *
 * Les chiffres précis sont ce qui fait citer une page (+33 % de visibilité
 * mesurée, Aggarwal et al., KDD 2024). Encore faut-il qu'ils soient vrais :
 * c'est pour ça qu'ils sont calculés, pas rédigés.
 *
 * ── CORRIGÉ LE 02/10/2026 ─────────────────────────────────────────────
 *
 * La page disait qu'une heure creuse annulée « couvre les deux tiers d'une
 * heure pleine », et la FAQ que l'avoir « se déduit » de la réservation
 * suivante. Les deux sont faux : un avoir paie une réservation ENTIÈRE et ne
 * se combine pas avec la carte (CG art. 10.5 ; `src/domain/avoirs.ts` refuse
 * le paiement mixte). C'était un calcul, sur la page du calcul : le pire
 * endroit pour une erreur, parce que c'est celui qu'un moteur cite.
 *
 * LE COMPARATIF « À L'HEURE OU ABONNEMENT ». La requête porte un choix ; la
 * forme comparative est celle que ChatGPT cite le plus (HubSpot 2026). On ne
 * publie AUCUN prix d'abonnement concurrent : aucun n'est vérifié. On publie la
 * règle de calcul, qui reste vraie quel que soit l'abonnement du lecteur.
 */

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

/** Le mois, en heures : de quoi comparer à n'importe quel abonnement. */
const HEURES_PAR_MOIS = [4, 8, 12, 20] as const

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Combien coûtent dix heures de coaching par mois ?',
    reponse: `${f(10 * C)} si les dix heures sont en heure creuse, ${f(10 * P)} si elles sont en heure pleine, et ${f(5 * C + 5 * P)} pour cinq de chaque. Il n’y a rien d’autre à payer : ni abonnement, ni frais d’inscription.`,
  },
  {
    question: 'Peut-on réserver deux heures d’affilée ?',
    reponse: `Oui : chaque heure est un créneau distinct, vous en réservez deux qui se suivent. Elles comptent pour deux dans la limite de ${REGLAGES_DEFAUT.max_active_reservations} réservations en cours.`,
  },
  {
    question: 'Peut-on réserver dans plusieurs clubs la même semaine ?',
    reponse: `Oui. Les cinq clubs se réservent depuis le même compte, au même prix. La seule limite est de ${REGLAGES_DEFAUT.max_active_reservations} réservations en cours à la fois, tous clubs confondus.`,
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
    reponse: `Oui, si l’avoir couvre tout le prix de l’heure : il ne se combine pas avec la carte. Un avoir de ${f(C)} paie une heure creuse ; s’il dépasse le prix, le solde reste sur votre compte, utilisable dans n’importe quel club.`,
  },
]

const SOURCES: readonly Source[] = [
  REGLES.prix.source,
  REGLES.limite.source,
  REGLES.avoir.source,
  REGLES.coursDuClub.source,
  COMPARAISON.basicFit.source,
  RESEAU.siteOfficiel,
  ...Object.values(CLUBS_VERITE).flatMap((c) => c.sources),
]

export default function Page() {
  const heures = [...HEURES_CREUSES, ...HEURES_PLEINES].sort((a, b) => a - b)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="a-l-heure">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Location de salle de sport à l’heure', path: CHEMIN },
          ]}
        />
        <h1>Louer une salle de sport à l’heure à Toulouse : ce que ça coûte</h1>
        <p className="reponse">
          Une heure de salle coûte {f(C)} en heure creuse et {f(P)} en heure pleine
          dans les cinq clubs Boxing Center de l’agglomération toulousaine. Trois
          séances par semaine en heure creuse reviennent à {f(3 * C)} par semaine,
          sans abonnement ni frais d’inscription.
        </p>
        <MisAJour chemin={CHEMIN} />
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>
            Le prix de chaque heure, de {PREMIERE_HEURE} h à {DERNIERE_HEURE_DEBUT + 1} h
          </h2>
          <p className="intro">
            {heures.length} créneaux d’une heure par jour, du lundi au samedi. Le prix ne
            dépend que de l’heure de début.
          </p>
          <div className="comparatif">
            <table>
              <caption>Grille appliquée dans les cinq clubs, du lundi au samedi, toutes taxes comprises.</caption>
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
          <p>{REGLES.coursDuClub.texte}</p>
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
                  <td>{plagesHoraires(HEURES_CREUSES)}</td>
                  <td>{plagesHoraires(HEURES_PLEINES)}</td>
                </tr>
                <tr>
                  <th scope="row">Le moment de la journée</th>
                  <td>La matinée et le début d’après-midi</td>
                  <td>La pause de midi et la fin de journée</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Location à l’heure ou abonnement : le calcul qui tranche</h2>
          <p>
            Un abonnement se paie chaque mois, que vous coachiez ou non ; une heure louée ne
            se paie que le jour où vous coachez. Pour comparer, divisez le prix mensuel de
            l’abonnement par {f(C)} : c’est le nombre d’heures creuses par mois au-delà
            duquel il devient plus avantageux — à condition que son règlement vous autorise à
            y faire travailler vos clients, ce qui chez {COMPARAISON.basicFit.marque} demande
            une autorisation écrite préalable.
          </p>
          <div className="comparatif">
            <table>
              <caption>Ce que coûte un mois de coaching à l’heure, selon le nombre d’heures et la plage.</caption>
              <thead>
                <tr>
                  <th scope="col">Heures par mois</th>
                  <th scope="col">Toutes en heure creuse</th>
                  <th scope="col">Toutes en heure pleine</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Mois sans séance</th>
                  <td>{f(0)}</td>
                  <td>{f(0)}</td>
                </tr>
                {HEURES_PAR_MOIS.map((n) => (
                  <tr key={n}>
                    <th scope="row">{n} heures</th>
                    <td>{f(n * C)}</td>
                    <td>{f(n * P)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Une heure suffit : ni minimum, ni forfait, ni carnet</h2>
          <p>
            Vous pouvez réserver une seule heure, une fois, sans engagement pour la suite.
            Aucun forfait ni carnet ne s’achète d’avance : chaque heure se paie au moment où
            vous la réservez, en une fois, par carte bancaire ou avec un avoir qui en couvre
            le prix.
          </p>
          <Fondement regle={REGLES.paiement} />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Trois réservations en cours à la fois, pour partager la semaine</h2>
          <p>
            {REGLES.limite.texte} La limite existe pour qu’aucun coach ne bloque la semaine
            des autres.
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur le prix à l’heure" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Calculez, puis réservez</h2>
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

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} titre="Les sources de la grille et des calculs" />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </>
  )
}
