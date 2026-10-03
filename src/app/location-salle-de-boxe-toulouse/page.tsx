import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
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
 *
 * ── CORRIGÉ LE 02/10/2026 ─────────────────────────────────────────────
 *
 * · Le tableau « quel espace choisir » plaçait des « sacs lourds » dans les
 *   cinq clubs : la page officielle de Ramonville ne cite qu'un ring et un
 *   octogone. Chaque case dit maintenant ce que la page du club écrit.
 * · « Un coach de boxe trouve rarement un ring dans une salle généraliste » :
 *   une généralité sur les autres, sans source. Le paragraphe parle désormais
 *   de ce qu'on peut prouver — l'équipement des cinq clubs.
 * · Les heures de cours du club, et le partage de l'espace avec les adhérents
 *   (CG art. 3.3), manquaient.
 */
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
    reponse: `L’accès à l’espace réservé et à son équipement fixe : rings, sacs de frappe, tatamis, cage ou octogone selon le club. ${REGLES.equipement.texte}`,
  },
  {
    question: 'Quelles chaussures sur le ring et les tatamis ?',
    reponse: REGLES.chaussures.texte,
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
  const SOURCES: Source[] = [
    RESEAU.affirmationEtatsUnis.source,
    ...clubs.flatMap((c) => c.sources),
    REGLES.partage.source,
    REGLES.equipement.source,
    REGLES.chaussures.source,
    REGLES.coursDuClub.source,
  ]

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="salle-de-boxe">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Location de salle de boxe', path: CHEMIN },
          ]}
        />
        <h1>Louer une salle de boxe à Toulouse, à l’heure</h1>
        <p className="reponse">
          Les cinq clubs Boxing Center de l’agglomération toulousaine se louent à
          l’heure aux coachs, avec {TOTAL_RINGS} rings répartis entre eux, des sacs
          de frappe, des tatamis et deux espaces MMA. Une heure coûte{' '}
          {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} ou{' '}
          {prixCourt(REGLAGES_DEFAUT.peak_cents)} selon le moment de la journée.
        </p>
        <MisAJour chemin={CHEMIN} />
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
                  <td>Ring, sacs de frappe</td>
                  <td>
                    Un ring dans chacun des cinq clubs ; des sacs aux Minimes, à Saint-Cyprien,
                    aux États-Unis et à Portet-sur-Garonne
                  </td>
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
                  <td>États-Unis (16 sacs de frappe), Portet-sur-Garonne (24 sacs de frappe)</td>
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
            Une salle généraliste s’organise autour des machines et des poids libres ; une
            séance de boxe demande un ring, des sacs suspendus et un tapis assez grand pour
            travailler les déplacements. Dans les cinq clubs Boxing Center, c’est
            l’équipement de base : {TOTAL_RINGS} rings, des sacs de frappe, des tatamis, une
            cage aux États-Unis et un octogone à Ramonville. Vous arrivez avec vos gants, vous
            n’installez rien.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Des espaces réservables séparément aux États-Unis et à Portet</h2>
          <p>
            Aux États-Unis et à Portet-sur-Garonne, chaque espace a son propre planning :
            deux coachs peuvent travailler dans le même club sans partager la même zone.
            {' '}{REGLES.partage.texte}
          </p>
          <p>{REGLES.coursDuClub.texte}</p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur la location d’une salle de boxe" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Trouvez le club qui a votre équipement</h2>
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

      <Sources
        items={SOURCES}
        verifieLe={REGISTRE_VERIFIE_LE}
        titre="Les sources : pages officielles des clubs et règlement"
      />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </>
  )
}
