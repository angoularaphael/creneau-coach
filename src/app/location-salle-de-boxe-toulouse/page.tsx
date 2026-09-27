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
import { ESPACES_PAR_CLUB, REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'

const CHEMIN = '/location-salle-de-boxe-toulouse'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * « LOCATION SALLE DE BOXE » — Toulouse.
 *
 * L'autocomplétion de Google propose « location salle de boxe » suivi d'une
 * ville (Paris, Lille, Bruxelles) et « location salle de combat » : la forme
 * « … Toulouse » est le motif naturel de la requête locale.
 *
 * L'ANGLE : L'ÉQUIPEMENT DE COMBAT, CLUB PAR CLUB. Chaque club a son H3, et sous
 * chaque H3 la phrase EXACTE que publie la page officielle du club, avec son
 * lien. C'est ce qui rend cette page impossible à confondre avec « location
 * de salle pour coach sportif » (le cadre) ou « ring de boxe » (les rings).
 *
 * Le total des rings n'est pas écrit : il est calculé à partir des cinq
 * citations (`TOTAL_RINGS`).
 */

const MIS_A_JOUR = '2026-09-27'
const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug

/** Les espaces réservables, en clair — le nom exact que porte le cahier (§3.2). */
const NOM_ESPACE: Record<string, string> = {
  salle: 'la salle',
  boxe: 'l’espace Boxe',
  'mma-sol': 'l’espace MMA / Sol',
  fitness: 'l’espace Fitness',
  'boxe-fitness': 'l’espace Boxe et Fitness',
}

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Peut-on louer une salle de boxe pour une seule heure ?',
    reponse: `Oui. Chaque créneau dure une heure et se réserve seul : ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} en heure creuse, ${prixCourt(REGLAGES_DEFAUT.peak_cents)} en heure pleine, sans abonnement.`,
  },
  {
    question: 'Quels clubs ont un espace MMA ou un travail au sol ?',
    reponse:
      'Le club des États-Unis a un espace MMA / Sol équipé d’une cage surélevée, et Portet-sur-Garonne un espace MMA / Sol. Ramonville dispose aussi d’un octogone de 7 mètres.',
  },
  {
    question: 'Qu’est-ce qui est inclus dans l’heure louée ?',
    reponse:
      'L’accès à l’espace réservé et à son équipement fixe : rings, sacs de frappe, tatamis selon le club. Prévoyez l’équipement individuel de votre client.',
  },
  {
    question: 'Les espaces MMA se réservent-ils à part ?',
    reponse:
      'Oui. Aux États-Unis comme à Portet-sur-Garonne, chaque espace a son propre planning et sa propre capacité : réserver l’espace MMA / Sol ne bloque pas l’espace Boxe.',
  },
  {
    question: 'Quelle est la salle de boxe la plus grande du réseau ?',
    reponse: `Boxing Center présente son club de l’avenue des États-Unis comme ${RESEAU.affirmationEtatsUnis.texte}. Portet-sur-Garonne annonce pour sa part une salle de boxe de 500 m².`,
  },
]

export default function Page() {
  const clubs = Object.values(CLUBS_VERITE)
  const dateMaj = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(MIS_A_JOUR))
  const SOURCES: Source[] = [RESEAU.affirmationEtatsUnis.source, ...clubs.flatMap((c) => c.sources)]

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="salle-de-boxe">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Location de salle de boxe
        </p>
        <h1>Louer une salle de boxe à Toulouse, à l’heure</h1>
        <p className="reponse">
          Les cinq clubs Boxing Center de l’agglomération toulousaine se louent à
          l’heure aux coachs, avec {TOTAL_RINGS} rings répartis entre eux, des sacs
          de frappe, des tatamis et deux espaces MMA. Une heure coûte{' '}
          {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} ou{' '}
          {prixCourt(REGLAGES_DEFAUT.peak_cents)} selon le moment de la journée.
        </p>
        <p className="maj">
          Mis à jour le <time dateTime={MIS_A_JOUR}>{dateMaj}</time>
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>L’équipement de combat, club par club</h2>
          <p className="intro">
            Chaque description reprend mot pour mot la page officielle du club.
          </p>
          {clubs.map((c) => {
            const slug = slugDe(c.id)
            const espaces = (ESPACES_PAR_CLUB[c.id] as readonly string[]).map((e) => NOM_ESPACE[e] ?? e)
            return (
              <article key={c.id} className="club-combat">
                <h3>{c.nom}</h3>
                <address>{adresseEnLigne(c)}</address>
                <blockquote className="citation" cite={c.sources[0]?.url}>
                  <p>« {c.equipement.citation} »</p>
                  <footer>
                    —{' '}
                    <a href={c.sources[0]?.url} rel="noopener" target="_blank">
                      page officielle du club
                    </a>
                  </footer>
                </blockquote>
                <p>
                  Réservable : {espaces.join(', ')}.
                  {slug ? (
                    <>
                      {' '}
                      <Link href={`/clubs/${slug}`}>Voir les heures libres</Link>
                    </>
                  ) : null}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>{TOTAL_RINGS} rings dans le réseau, dont 3 aux Minimes</h2>
          <p>
            Les Minimes en comptent trois, les États-Unis deux rings de compétition,
            Saint-Cyprien, Ramonville et Portet-sur-Garonne un chacun — dont deux
            rings olympiques. Le détail et le prix d’une heure au ring sont sur la
            page{' '}
            <Link href="/location-ring-de-boxe-toulouse">location de ring de boxe</Link>.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Boxe anglaise, pieds-poings, MMA : quel espace choisir</h2>
          <div className="comparatif">
            <table>
              <caption>Où trouver l’équipement selon la discipline enseignée.</caption>
              <thead>
                <tr>
                  <th scope="col">Discipline</th>
                  <th scope="col">Ce qu’il faut</th>
                  <th scope="col">Où le trouver</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Boxe anglaise</th>
                  <td>Ring, sacs lourds</td>
                  <td>Les cinq clubs</td>
                </tr>
                <tr>
                  <th scope="row">Boxe pieds-poings</th>
                  <td>Ring, sacs, tatamis</td>
                  <td>Saint-Cyprien, États-Unis, Portet-sur-Garonne</td>
                </tr>
                <tr>
                  <th scope="row">MMA, grappling</th>
                  <td>Cage ou octogone, tapis de sol</td>
                  <td>États-Unis (cage surélevée), Ramonville (octogone de 7 m), Portet (panneaux MMA)</td>
                </tr>
                <tr>
                  <th scope="row">Préparation physique</th>
                  <td>Sacs, espace dégagé</td>
                  <td>États-Unis (espace Fitness, 16 sacs), Portet (24 sacs)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Salle de boxe ou salle de sport généraliste : la différence pour un coach</h2>
          <p>
            Une salle de sport généraliste est pensée pour des machines et des
            poids libres. Un coach de boxe y trouve rarement un ring, des sacs lourds
            suspendus ou un tapis assez grand pour travailler les déplacements. Dans
            un club de boxe, tout est déjà là : vous arrivez avec vos gants, vous
            repartez sans rien avoir installé.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Deux coachs au plus dans le même espace</h2>
          <p>
            Un espace accueille au maximum deux coachs à la même heure. Aux
            États-Unis et à Portet-sur-Garonne, les espaces se réservent
            séparément : deux coachs peuvent travailler dans le même club sans
            partager la même zone.
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur la location d’une salle de boxe" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Trouvez l’heure et le club</h2>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/location-salle-coach-sportif-toulouse">
              Qui peut réserver
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
            { name: 'Location de salle de boxe', path: CHEMIN },
          ]),
        ]}
      />
    </>
  )
}
