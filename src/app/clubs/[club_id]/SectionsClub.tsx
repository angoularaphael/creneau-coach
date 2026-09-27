import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { Sources } from '@/components/aeo/Sources'
import type { QuestionReponse } from '@/lib/seo/jsonld'
import { CLUBS_VERITE, LOI, REGISTRE_VERIFIE_LE, RESEAU, adresseEnLigne, type ClubVerite } from '@/lib/seo/verite'
import { ESPACES_PAR_CLUB } from '@/domain/contrat'

/**
 * LES SECTIONS QUI FONT D'UNE PAGE DE CLUB UNE PAGE QU'ON PEUT CITER.
 *
 * La page ne portait qu'un H2 — « Créneaux » — au-dessus du calendrier. Pour
 * « salle de boxe Minimes » ou « louer un ring à Ramonville », c'est pourtant
 * ELLE qui doit répondre : c'est la page locale. Et une page qui n'affirme
 * rien de vérifiable n'a rien qu'un moteur puisse reprendre.
 *
 * ── LE TEST DU REMPLACEMENT ─────────────────────────────────────────────
 *
 * Cinq clubs, un seul composant : le risque est d'obtenir cinq pages qui ne
 * diffèrent que par le nom. Google en garde une et replie les autres — sept
 * sites de la famille ont fini à zéro page indexée pour cette raison.
 *
 * Ici, chaque phrase est construite à partir des FAITS du club (son adresse,
 * son équipement cité mot pour mot, ses espaces, son accès), et la FAQ est
 * générée de ces faits. Changez de club, et la page change de contenu, pas
 * seulement de nom. Une question dont la réponse serait identique partout n'a
 * pas sa place ici — elle vit sur les pages d'intention.
 */

const NOM_ESPACE: Record<string, string> = {
  salle: 'la salle',
  boxe: 'l’espace Boxe',
  'mma-sol': 'l’espace MMA / Sol',
  fitness: 'l’espace Fitness',
  'boxe-fitness': 'l’espace Boxe et Fitness',
}

/**
 * La réponse sur les rings, CALCULÉE à partir des cinq clubs.
 *
 * Une première version écrivait « le club le mieux équipé du réseau » en dur
 * pour les Minimes. Vrai aujourd'hui, faux le jour où un autre club ajoute un
 * ring — et personne ne penserait à relire cette phrase-là. Le rang se déduit
 * donc des données, à chaque rendu.
 */
function reponseRings(club: ClubVerite): string {
  const tous = Object.values(CLUBS_VERITE)
  const max = Math.max(...tous.map((c) => c.equipement.rings))
  const n = club.equipement.rings
  if (n <= 1) return 'Un ring, qui fait partie de l’espace réservé.'
  const nbAuMax = tous.filter((c) => c.equipement.rings === max).length
  if (n === max && nbAuMax === 1) return `${n} rings — aucun autre club du réseau n’en compte autant.`
  const nbPlusieurs = tous.filter((c) => c.equipement.rings > 1).length
  return `${n} rings. ${nbPlusieurs} clubs du réseau en comptent plusieurs.`
}

export type Disponibilite = {
  /** Heures encore libres sur la période affichée, dans l'espace affiché. */
  readonly libres: number
  readonly libresCreuses: number
  /** L'identifiant de l'espace affiché — son nom en clair vient de NOM_ESPACE. */
  readonly espaceId: string
}

export function SectionsClub({
  club,
  quartier,
  dispo,
}: {
  club: ClubVerite
  quartier: string
  dispo: Disponibilite
}) {
  const espaces = (ESPACES_PAR_CLUB[club.id] as readonly string[]).map((e) => NOM_ESPACE[e] ?? e)
  const plusieursEspaces = espaces.length > 1
  const adresse = adresseEnLigne(club)
  // Un lien de carte, pas une carte intégrée : aucune coordonnée n'est
  // vérifiée, et une épingle placée à la main pourrait être fausse. La
  // recherche par adresse laisse le service de cartes faire son travail.
  const lienCarte = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${club.nom}, ${adresse}`)}`

  const questions: QuestionReponse[] = [
    {
      question: `Où se trouve ${club.nom} ?`,
      reponse: `Au ${adresse}.${club.acces ? ` ${club.acces.texte}` : ''}`,
    },
    {
      question: `Quel équipement trouve-t-on à ${quartier} ?`,
      reponse: `D’après la page officielle du club : « ${club.equipement.citation} ».`,
    },
    {
      question: `Combien de rings y a-t-il à ${quartier} ?`,
      reponse: reponseRings(club),
    },
    plusieursEspaces
      ? {
          question: `Les espaces de ${quartier} se réservent-ils séparément ?`,
          reponse: `Oui. Le club compte ${espaces.length} espaces réservables — ${espaces.join(', ')} — chacun avec son planning et deux coachs au plus à la même heure.`,
        }
      : {
          question: `Combien de coachs peuvent travailler en même temps à ${quartier} ?`,
          reponse: `Deux au maximum à la même heure, qui se partagent ${club.equipement.resume}. Les places restantes sont affichées sur chaque créneau avant la réservation.`,
        },
  ]

  return (
    <>
      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>L’équipement du club, tel qu’il le décrit</h2>
          <blockquote className="citation" cite={club.sources[0]?.url}>
            <p>« {club.equipement.citation} »</p>
            <footer>
              —{' '}
              <a href={club.sources[0]?.url} rel="noopener" target="_blank">
                {club.sources[0]?.libelle}
              </a>
            </footer>
          </blockquote>
          <p>
            Tout cet équipement fixe est compris dans l’heure : vous arrivez avec
            vos clients et l’équipement individuel, le reste est déjà en place.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Adresse et accès</h2>
          <address className="adresse-club">
            <strong>{club.nom}</strong>
            <br />
            {club.rue}
            <br />
            {club.codePostal} {club.ville}
          </address>
          {club.acces ? <p>{club.acces.texte}</p> : null}
          <p>
            <a className="lien-fleche" href={lienCarte} rel="noopener" target="_blank">
              Ouvrir l’itinéraire
            </a>
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>
            {plusieursEspaces
              ? `${espaces.length} espaces à réserver séparément`
              : 'Un espace, deux coachs au plus'}
          </h2>
          <p>
            {plusieursEspaces
              ? `Le club se découpe en ${espaces.join(', ')}. Chaque espace a son propre planning : deux coachs peuvent travailler dans le même club sans partager la même zone, et chacun accueille au plus deux coachs à la même heure.`
              : `La salle — ${club.equipement.resume} — accueille au plus deux coachs à la même heure : assez pour travailler sans se gêner, jamais assez pour s’y marcher dessus.`}
          </p>
        </div>
      </section>

      {/*
        CE QUE SEULE CETTE PAGE PEUT DIRE.

        Deux sections étaient recopiées à l'identique sur les cinq pages de
        club — le prix et la carte professionnelle. Le test du remplacement les
        a trouvées : jusqu'à 40 % de phrases communes entre deux clubs. Elles
        vivent désormais sur les pages d'intention, liées d'ici.

        À leur place : le nombre d'heures ENCORE LIBRES dans ce club, calculé
        sur la grille servie à cet instant. Une information qu'aucune autre page
        ne peut porter, qui change chaque semaine, et qui est vraie par
        construction — elle se lit dans le calendrier juste au-dessus.
      */}
      <section className="section">
        <div className="enveloppe">
          <h2>
            {dispo.libres > 0
              ? `${dispo.libres} heure${dispo.libres > 1 ? 's' : ''} encore libre${dispo.libres > 1 ? 's' : ''} sur la période affichée`
              : 'Toutes les heures affichées sont prises'}
          </h2>
          <p>
            {dispo.libres > 0
              ? `Dans ${NOM_ESPACE[dispo.espaceId] ?? 'la salle'} de ${quartier}, dont ${dispo.libresCreuses} en heure creuse — un compte qui suit le calendrier ci-dessus à chaque réservation.`
              : `Dans ${NOM_ESPACE[dispo.espaceId] ?? 'la salle'} de ${quartier}. Changez de semaine dans le calendrier, ou regardez un autre club.`}{' '}
            <Link href="/location-salle-de-sport-a-l-heure-toulouse">
              Ce que coûte une semaine de coaching
            </Link>{' '}
            ·{' '}
            <Link href="/location-salle-coach-sportif-toulouse">Qui peut réserver</Link>
          </p>
        </div>
      </section>

      <Faq items={questions} titre={`Les questions sur ${club.nom}`} />

      <Sources
        items={[...club.sources, LOI.qualification.source, RESEAU.siteOfficiel]}
        verifieLe={REGISTRE_VERIFIE_LE}
      />
    </>
  )
}
