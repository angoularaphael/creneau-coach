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
  REGISTRE_VERIFIE_LE,
  REGLES,
  RESEAU,
  TOTAL_RINGS,
  adresseEnLigne,
  type Source,
} from '@/lib/seo/verite'
import { ESPACES_PAR_CLUB, REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'
import '@/styles/contenu.css'

const CHEMIN = '/location-ring-de-boxe-toulouse'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * « LOCATION RING DE BOXE TOULOUSE » — requête relevée MOT POUR MOT dans
 * l'autocomplétion de Google le 27/09/2026.
 *
 * ATTENTION À L'INTENTION MIXTE. La même autocomplétion propose « location ring
 * de boxe gonflable » et « … prix » : une partie des gens cherche un ring à
 * faire livrer pour un événement. Ce n'est pas ce que ce service fait.
 *
 * La barre commerciale tranche où le dire : JAMAIS en tête. La première phrase
 * vend ce qui existe — 8 rings, à l'heure, dans 5 clubs. La précision sur
 * l'événementiel vit dans la FAQ, où celui qui la cherche la trouve, et où elle
 * ne coupe pas le clic de celui qui voulait bien un ring d'entraînement.
 *
 * L'ANGLE : LES RINGS EUX-MÊMES — où, combien, de quel type. Le tableau est
 * construit depuis le registre ; le total est calculé.
 *
 * ── CORRIGÉ LE 02/10/2026 ─────────────────────────────────────────────
 *
 * · « Les cordes sont tendues, le tapis est propre » : une promesse que
 *   personne ne contrôle. Le contrat dit ce qui est vrai — des équipements
 *   entretenus par le club (CG art. 12.1) — et le règlement ce que le coach
 *   doit en retour : remettre le matériel en place (RI art. 4.4).
 * · « Pour le travail aux gants et les rounds chronométrés » était un avis sans
 *   fait. À sa place, la comparaison que la requête appelle — « ring ou sacs ? »
 *   — et la règle que tout coach de boxe demande : les mises de gants sont
 *   permises, à intensité maîtrisée, avec protections (RI art. 4.3).
 * · « Aurai-je le ring pour moi seul ? » oubliait les adhérents (CG art. 3.3).
 * · « Peut-on réserver le ring un dimanche ? Non » ouvrait sur une absence ; la
 *   question dit maintenant ce qui existe, heures de cours du club comprises.
 */

const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug

/** Les clubs où l'espace réservé est la salle entière, ring compris. */
const CLUBS_A_UNE_SALLE = (Object.keys(ESPACES_PAR_CLUB) as ClubId[])
  .filter((id) => ESPACES_PAR_CLUB[id].length === 1)
  .map((id) => CLUBS_VERITE[id].nom.replace(/^Boxing Center (Toulouse )?/, ''))

/** Le type de ring, UNIQUEMENT quand la page officielle le précise. */
const TYPE_RING: Partial<Record<ClubId, string>> = {
  'etats-unis': 'Rings de compétition',
  ramonville: 'Ring olympique',
  portet: 'Ring olympique',
}

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Combien coûte une heure sur un ring de boxe à Toulouse ?',
    reponse: `${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} en heure creuse et ${prixCourt(REGLAGES_DEFAUT.peak_cents)} en heure pleine, dans les cinq clubs Boxing Center. L’heure donne accès à l’espace réservé, ring compris.`,
  },
  {
    question: 'Peut-on louer un ring pour un gala ou un événement ?',
    reponse: `Les rings se louent à l’heure, dans les clubs, pour l’entraînement de vos clients. Pour un gala ou un événement, le réseau Boxing Center étudie la demande directement au ${RESEAU.telephone.affiche}.`,
  },
  {
    question: 'Aurai-je le ring pour moi seul ?',
    reponse: `Pas forcément : l’heure se réserve par espace, pas par ring. ${REGLES.partage.texte} Aux Minimes, les trois rings laissent de la place à chacun.`,
  },
  {
    question: 'Quels clubs ont un ring olympique ?',
    reponse:
      'Ramonville et Portet-sur-Garonne annoncent chacun un ring olympique. Le club des États-Unis dispose de deux rings de compétition.',
  },
  {
    question: 'Quels jours et à quelles heures le ring se réserve-t-il ?',
    reponse: `${REGLES.grille.texte} ${REGLES.coursDuClub.texte}`,
  },
  {
    question: 'Peut-on faire des mises de gants sur le ring ?',
    reponse: `Oui, à intensité maîtrisée. ${REGLES.opposition.texte}`,
  },
]

export default function Page() {
  const clubs = Object.values(CLUBS_VERITE)
  const SOURCES: Source[] = [
    RESEAU.telephone.source,
    ...clubs.flatMap((c) => c.sources),
    REGLES.opposition.source,
    REGLES.partage.source,
    REGLES.coursDuClub.source,
  ]
  const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
  const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="ring-de-boxe">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Location de ring de boxe', path: CHEMIN },
          ]}
        />
        <h1>Louer un ring de boxe à Toulouse, à l’heure</h1>
        <p className="reponse">
          Boxing Center met {TOTAL_RINGS} rings à la disposition des coachs dans cinq
          clubs de Toulouse et de son agglomération, à réserver à l’heure. Une heure
          coûte {creuse} en heure creuse et {pleine} en heure pleine, sans abonnement.
        </p>
        <MisAJour chemin={CHEMIN} />
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Où se trouvent les {TOTAL_RINGS} rings</h2>
          <div className="comparatif">
            <table>
              <caption>
                Nombre et type de rings selon la page officielle de chaque club.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Club</th>
                  <th scope="col">Rings</th>
                  <th scope="col">Type</th>
                  <th scope="col">Adresse</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => {
                  const slug = slugDe(c.id)
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        {slug ? <Link href={`/clubs/${slug}`}>{c.nom.replace('Boxing Center ', '')}</Link> : c.nom}
                      </th>
                      <td>{c.equipement.rings}</td>
                      <td>{TYPE_RING[c.id] ?? 'Ring de boxe'}</td>
                      <td>{adresseEnLigne(c)}</td>
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
          <h2>Ce que vous louez : l’espace et son ring, pour une heure</h2>
          <p>
            Vous réservez une heure dans un espace du club, et le ring fait partie de cet
            espace. Il est en place et entretenu par le club : vous arrivez avec votre client
            et vos gants, il n’y a rien à monter ni à transporter, et vous remettez le
            matériel à sa place en partant. Dans les clubs à une seule salle —{' '}
            {CLUBS_A_UNE_SALLE.join(', ').replace(/, ([^,]*)$/, ' et $1')} —, l’espace réservé
            est la salle entière, ring compris.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Ring olympique ou ring de compétition : ce que disent les clubs</h2>
          <p>
            Ramonville et Portet-sur-Garonne annoncent un ring olympique ; le club
            des États-Unis, deux rings de compétition. Les Minimes et
            Saint-Cyprien ne précisent pas le type de leurs rings — nous ne
            l’inventons donc pas.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Une heure au ring coûte {creuse} ou {pleine}</h2>
          <p>
            Le ring n’est pas facturé à part : il est compris dans l’heure réservée.
            Le prix ne dépend que du moment de la journée, jamais du club. Le détail
            heure par heure est sur la page{' '}
            <Link href="/location-salle-de-sport-a-l-heure-toulouse">
              location de salle à l’heure
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Ring ou sacs de frappe : quel espace pour quelle séance</h2>
          <div className="comparatif">
            <table>
              <caption>Ce que chaque équipement apporte à une séance, et où le trouver.</caption>
              <thead>
                <tr>
                  <th scope="col">Critère</th>
                  <th scope="col">Ring</th>
                  <th scope="col">Sacs de frappe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Ce qu’on y travaille</th>
                  <td>Déplacements entre les cordes, sortie de coin, gestion de la distance, mises de gants</td>
                  <td>Enchaînements, puissance, précision de frappe, cardio</td>
                </tr>
                <tr>
                  <th scope="row">Où le trouver</th>
                  <td>Les cinq clubs, {TOTAL_RINGS} rings au total</td>
                  <td>Minimes, Saint-Cyprien, États-Unis (16 sacs), Portet-sur-Garonne (24 sacs)</td>
                </tr>
                <tr>
                  <th scope="row">Protections en opposition</th>
                  <td>Gants et bandes, protège-dents, casque</td>
                  <td>Gants et bandes</td>
                </tr>
                <tr>
                  <th scope="row">Prix de l’heure</th>
                  <td colSpan={2}>Le même : {creuse} en heure creuse, {pleine} en heure pleine</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Mises de gants sur le ring : intensité maîtrisée, protections obligatoires</h2>
          <p>{REGLES.opposition.texte}</p>
          <Fondement regle={REGLES.opposition} />
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur la location d’un ring" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Prenez votre heure au ring</h2>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/location-salle-de-boxe-toulouse">
              Tout l’équipement de boxe
            </Link>
          </div>
        </div>
      </section>

      <Sources
        items={SOURCES}
        verifieLe={REGISTRE_VERIFIE_LE}
        titre="Les sources : les rings, club par club, et le règlement"
      />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </>
  )
}
