import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { Sources } from '@/components/aeo/Sources'
import { CLUB_PAGES, metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import {
  CLUBS_VERITE,
  REGISTRE_VERIFIE_LE,
  TOTAL_RINGS,
  adresseEnLigne,
  type ClubVerite,
} from '@/lib/seo/verite'
import { ESPACES_PAR_CLUB, REGLAGES_DEFAUT, prixCourt, type ClubId } from '@/domain/contrat'

export const metadata = metadataDeRoute('/clubs')

/**
 * LES CINQ CLUBS — la page pivot.
 *
 * DEUX DÉFAUTS CORRIGÉS ICI :
 *
 * 1. Les cinq liens pointaient vers `/clubs/minimes`, l'identifiant technique,
 *    qui redirige en 308 vers `/clubs/coaching-toulouse-minimes`. Chaque lien
 *    interne de la page centrale passait donc par un détour — un lien interne
 *    doit viser l'adresse canonique, sans rebond.
 *
 * 2. La page tenait en un H1 « Nos clubs » et une phrase. Elle devient la
 *    COMPARAISON des cinq clubs : le format que ChatGPT cite le plus (HubSpot,
 *    State of AEO 2026), et la vraie question de quelqu'un qui arrive ici —
 *    « lequel choisir ? ». Le tableau est construit depuis le registre de
 *    vérité : chaque case vient d'une page officielle de club.
 *
 * Page servie sans appel à la base : les faits comparés sont publics et
 * stables, ils n'ont pas besoin des créneaux. La page ne dépend donc plus de la
 * disponibilité de Supabase pour s'afficher.
 */

const NOM_ESPACE: Record<string, string> = {
  salle: 'Salle',
  boxe: 'Boxe',
  'mma-sol': 'MMA / Sol',
  fitness: 'Fitness',
  'boxe-fitness': 'Boxe et Fitness',
}

/** Ce que la page officielle précise au-delà des rings — rien n'est déduit. */
const PLUS: Partial<Record<ClubId, string>> = {
  'etats-unis': 'Cage surélevée, 400 m² de tapis, 16 sacs',
  ramonville: 'Octogone de 7 m',
  portet: 'Salle de 500 m², 24 sacs, panneaux MMA',
  'st-cyprien': 'Espace de tatamis',
}

const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug ?? id
const court = (c: ClubVerite) => c.nom.replace('Boxing Center ', '')

export default function ClubsPage() {
  const clubs = Object.values(CLUBS_VERITE)
  const plusDeRings = [...clubs].sort((a, b) => b.equipement.rings - a.equipement.rings)[0]!
  const avecCombatSol = clubs.filter((c) => (ESPACES_PAR_CLUB[c.id] as readonly string[]).includes('mma-sol'))
  const avecAcces = clubs.filter((c) => c.acces)

  const QUESTIONS: QuestionReponse[] = [
    {
      question: 'Quel club Boxing Center choisir pour un cours de MMA ?',
      reponse: `${avecCombatSol.map(court).join(' et ')} ont un espace MMA / Sol réservable séparément. Ramonville dispose aussi d’un octogone de 7 mètres.`,
    },
    {
      question: 'Quel club a le plus de rings ?',
      reponse: `${court(plusDeRings)}, avec ${plusDeRings.equipement.rings} rings. Le réseau en compte ${TOTAL_RINGS} au total.`,
    },
    {
      question: 'Les prix changent-ils d’un club à l’autre ?',
      reponse: `Non : ${prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure creuse et ${prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure pleine, dans les cinq clubs.`,
    },
    ...(avecAcces.length
      ? [
          {
            question: 'Quel club est le plus facile d’accès en transports en commun ?',
            reponse: `${avecAcces.map((c) => `${court(c)} : ${c.acces!.texte.charAt(0).toLowerCase()}${c.acces!.texte.slice(1)}`).join(' ')}`,
          },
        ]
      : []),
    {
      question: 'Peut-on réserver dans plusieurs clubs ?',
      reponse:
        'Oui. Chaque réservation se fait dans un club précis, et vous pouvez en tenir jusqu’à trois en cours, dans le même club ou dans des clubs différents.',
    },
  ]

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="clubs">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Nos clubs
        </p>
        <h1>5 salles de boxe à louer à l’heure, à Toulouse et autour</h1>
        <p className="reponse">
          Boxing Center loue aux coachs cinq clubs de l’agglomération toulousaine —
          Minimes, Saint-Cyprien, États-Unis, Ramonville et Portet-sur-Garonne — avec{' '}
          {TOTAL_RINGS} rings au total. Le prix est le même partout :{' '}
          {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} ou {prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Comparer les cinq clubs</h2>
          <div className="comparatif">
            <table>
              <caption>Équipement selon la page officielle de chaque club.</caption>
              <thead>
                <tr>
                  <th scope="col">Club</th>
                  <th scope="col">Rings</th>
                  <th scope="col">Aussi sur place</th>
                  <th scope="col">Espaces réservables</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      <Link href={`/clubs/${slugDe(c.id)}`}>{court(c)}</Link>
                    </th>
                    <td>{c.equipement.rings}</td>
                    <td>{PLUS[c.id] ?? 'Sacs de frappe'}</td>
                    <td>
                      {(ESPACES_PAR_CLUB[c.id] as readonly string[])
                        .map((e) => NOM_ESPACE[e] ?? e)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {clubs.map((c, i) => (
        <section
          key={c.id}
          className={i % 2 === 0 ? 'section section--encre' : 'section'}
          {...(i % 2 === 0 ? { 'data-polarite': 'encre' } : {})}
        >
          <div className="enveloppe">
            <h2>{c.nom}</h2>
            <address className="adresse-club">{adresseEnLigne(c)}</address>
            <p>Sur place : {c.equipement.resume}.</p>
            {c.acces ? <p>{c.acces.texte}</p> : null}
            <Link className="lien-fleche" href={`/clubs/${slugDe(c.id)}`}>
              Les heures libres à {court(c)}
            </Link>
          </div>
        </section>
      ))}

      <Faq items={QUESTIONS} titre="Choisir son club" />

      <Sources items={clubs.flatMap((c) => c.sources)} verifieLe={REGISTRE_VERIFIE_LE} />

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Accueil', path: '/' },
          { name: 'Nos clubs', path: '/clubs' },
        ])}
      />
    </>
  )
}
