import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { Sources } from '@/components/aeo/Sources'
import { CLUB_PAGES, metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import {
  CLUBS_VERITE,
  REGISTRE_VERIFIE_LE,
  RESEAU,
  TOTAL_RINGS,
  adresseEnLigne,
  type Source,
} from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'

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
 */

const MIS_A_JOUR = '2026-09-27'
const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug

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
    reponse: `Ce service loue des heures d’entraînement dans les clubs, pas un ring livré sur un autre lieu. Pour un événement, le réseau Boxing Center se contacte directement au ${RESEAU.telephone.affiche}.`,
  },
  {
    question: 'Aurai-je le ring pour moi seul ?',
    reponse:
      'L’heure se réserve par espace, et un espace accueille au plus deux coachs à la même heure. Aux Minimes, les trois rings laissent de la place aux deux coachs.',
  },
  {
    question: 'Quels clubs ont un ring olympique ?',
    reponse:
      'Ramonville et Portet-sur-Garonne annoncent chacun un ring olympique. Le club des États-Unis dispose de deux rings de compétition.',
  },
  {
    question: 'Peut-on réserver le ring un dimanche ?',
    reponse:
      'Non : les créneaux sont ouverts du lundi au samedi, de 10 h à 19 h.',
  },
]

export default function Page() {
  const clubs = Object.values(CLUBS_VERITE)
  const dateMaj = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(MIS_A_JOUR))
  const SOURCES: Source[] = [RESEAU.telephone.source, ...clubs.flatMap((c) => c.sources)]
  const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
  const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="ring-de-boxe">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Location de ring de boxe
        </p>
        <h1>Louer un ring de boxe à Toulouse, à l’heure</h1>
        <p className="reponse">
          Boxing Center met {TOTAL_RINGS} rings à la disposition des coachs dans cinq
          clubs de Toulouse et de son agglomération, à réserver à l’heure. Une heure
          coûte {creuse} en heure creuse et {pleine} en heure pleine, sans abonnement.
        </p>
        <p className="maj">
          Mis à jour le <time dateTime={MIS_A_JOUR}>{dateMaj}</time>
        </p>
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
            Vous réservez une heure dans un espace du club, et le ring fait partie
            de cet espace. Vous arrivez avec votre client, les cordes sont tendues,
            le tapis est propre : il n’y a rien à monter ni à démonter, et rien à
            transporter.
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
          <h2>Pour le travail aux gants et les rounds chronométrés</h2>
          <p>
            Un ring change la séance : vos clients apprennent à se déplacer entre les
            cordes, à sortir d’un coin, à gérer une distance que le sac ne donne
            pas. C’est ce qui sépare une séance de cardio-boxe d’un vrai travail de
            boxeur.
          </p>
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

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} />

      <JsonLd
        data={[
          serviceJsonLd(),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Location de ring de boxe', path: CHEMIN },
          ]),
        ]}
      />
    </>
  )
}
