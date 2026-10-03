import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { Fondement } from '@/components/aeo/Fondement'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { pageWebJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import { REGISTRE_VERIFIE_LE, REGLES, RESEAU, plagesHoraires, type Source } from '@/lib/seo/verite'
import { HEURES_CREUSES, HEURES_PLEINES, REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'
import '@/styles/contenu.css'

const CHEMIN = '/tarifs'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * TARIFS — les règles de l'argent.
 *
 * SON ANGLE, DISTINCT DE « SALLE À L'HEURE » : cette page-ci dit les RÈGLES —
 * ce qui est compris, comment on paie, ce que devient une heure annulée. Le
 * calcul d'une semaine de coaching vit sur l'autre page ; les deux se lient.
 * Deux pages sur le même sujet sans angle propre se mangent l'une l'autre dans
 * les résultats.
 *
 * ── CE QUI A CHANGÉ LE 02/10/2026, ET POURQUOI ────────────────────────
 *
 * 1. UNE PHRASE FAUSSE RETIRÉE. La FAQ disait que l'avoir « se déduit de
 *    n'importe quelle prochaine réservation ». Les CG (art. 10.5) et le moteur
 *    (`src/domain/avoirs.ts`) disent l'inverse : un avoir paie une réservation
 *    ENTIÈRE et ne se combine pas avec la carte. Un coach qui aurait cru
 *    payer 5 € de complément se serait heurté à un refus au moment de payer.
 *    Les règles viennent désormais de `REGLES` (registre de vérité), avec leur
 *    article.
 *
 * 2. LA PAGE N'AVAIT NI DATE, NI SOURCES, NI FIL D'ARIANE VISIBLE. Elle
 *    affirme des prix et des règles de contrat : c'est exactement le genre de
 *    page qu'un moteur de réponse cite, à condition qu'il puisse vérifier.
 *
 * 3. LE H2 FINAL ÉTAIT LE MÊME QUE CELUI DE « SALLE À L'HEURE ». Deux pages,
 *    un même H2 : le contrôle « aucun H2 dupliqué » (skill `aeo-geo` §6).
 *
 * 4. LES HEURES DE COURS DU CLUB. La page annonçait « du lundi au samedi »
 *    sans dire que les heures où le club donne un cours ne se louent pas
 *    (migration 0030, planning réel). Un coach qui voit « 10 h-19 h » et trouve
 *    17 h « Cours du club » croit à une erreur.
 *
 * L'absence de remboursement est dite — dans la FAQ, là où quelqu'un la
 * cherche, jamais en tête de page (barre commerciale : on vend ce qui existe).
 */

const C = REGLAGES_DEFAUT.offpeak_cents
const P = REGLAGES_DEFAUT.peak_cents

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Une heure annulée est-elle remboursée ?',
    reponse: `Elle devient un avoir. Annulée plus de ${REGLAGES_DEFAUT.cancel_min_hours} heures avant le créneau, l’heure vous rend un avoir égal au prix payé, valable sans limite de durée ; elle ne donne pas lieu à un remboursement sur la carte. Le remboursement intégral est réservé au créneau que Boxing Center ne peut pas fournir : vous choisissez alors entre avoir et remboursement.`,
  },
  {
    question: `Un avoir de ${prixCourt(C)} peut-il payer une heure pleine à ${prixCourt(P)} ?`,
    reponse: `Non : un avoir paie une réservation entière et ne se combine pas avec la carte. Un avoir de ${prixCourt(C)} paie une heure creuse ; une heure pleine demande ${prixCourt(P)} d’avoir, ou un paiement par carte. Quand un avoir dépasse le prix, le solde reste sur votre compte.`,
  },
  {
    question: 'Peut-on utiliser un avoir dans un autre club ?',
    reponse:
      'Oui. L’avoir est attaché à votre compte, pas à un club ni à un espace : il paie une réservation dans n’importe lequel des cinq clubs, dans n’importe quel espace.',
  },
  {
    question: `Que se passe-t-il si j’annule moins de ${REGLAGES_DEFAUT.cancel_min_hours} heures avant ?`,
    reponse:
      'L’annulation n’est plus possible et l’heure reste due, comme en cas d’absence. À moins d’un jour, la place ne peut plus être proposée à temps à un autre coach.',
  },
  {
    question: 'Peut-on payer en plusieurs fois ou sur place ?',
    reponse:
      'Non. Chaque heure se règle en une fois, en ligne, au moment de la réservation, par carte bancaire ou avec un avoir qui en couvre le prix. Elle n’est réservée qu’une fois le paiement accepté.',
  },
  {
    question: 'Le prix change-t-il selon l’espace ou l’équipement ?',
    reponse: `Non. Ring, sacs, tatamis, cage ou octogone : le prix dépend uniquement de l’heure de début, ${prixCourt(C)} en heure creuse et ${prixCourt(P)} en heure pleine, dans les cinq clubs.`,
  },
]

const SOURCES: readonly Source[] = [
  REGLES.prix.source,
  REGLES.option.source,
  REGLES.signature.source,
  REGLES.annulation.source,
  REGLES.annulationParLeClub.source,
  REGLES.equipement.source,
  REGLES.coursDuClub.source,
  RESEAU.siteOfficiel,
]

export default function TarifsPage() {
  return (
    <div data-geste="rebond">
      <header className="page-hero page-hero--visuel" data-visuel="tarifs">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Tarifs', path: CHEMIN },
          ]}
        />
        <h1>
          Tarifs : {prixCourt(C)} l’heure creuse, {prixCourt(P)} l’heure pleine
        </h1>
        {/* LA RÉPONSE : le prix, puis ce que devient l'argent si on annule —
            les deux moitiés de la question de la route. */}
        <p className="reponse">
          Une heure de salle coûte {prixCourt(C)} en heure creuse ({plagesHoraires(HEURES_CREUSES)})
          et {prixCourt(P)} en heure pleine ({plagesHoraires(HEURES_PLEINES)}), dans les cinq clubs
          Boxing Center de Toulouse. Elle se paie en une fois à la réservation, et une heure
          annulée plus de {REGLAGES_DEFAUT.cancel_min_hours} heures avant devient un avoir du
          même montant.
        </p>
        <MisAJour chemin={CHEMIN} />
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Deux prix, fixés par l’heure de début</h2>
          <div className="comparatif">
            <table>
              <caption>Du lundi au samedi, dans les cinq clubs, prix toutes taxes comprises.</caption>
              <thead>
                <tr>
                  <th scope="col">Plage</th>
                  <th scope="col">Prix d’une heure</th>
                  <th scope="col">Horaires</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Heure creuse</th>
                  <td>{prixCourt(C)}</td>
                  <td>{plagesHoraires(HEURES_CREUSES)}</td>
                </tr>
                <tr>
                  <th scope="row">Heure pleine</th>
                  <td>{prixCourt(P)}</td>
                  <td>{plagesHoraires(HEURES_PLEINES)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Les définitions : la forme la plus citée (HubSpot 2026). Quelqu'un
              qui demande « c'est quoi une heure creuse chez Boxing Center ? »
              reçoit cette phrase-là. */}
          <dl className="definitions">
            <div>
              <dt>Heure creuse</dt>
              <dd>
                Un créneau des plages {plagesHoraires(HEURES_CREUSES)} : la matinée et le
                début d’après-midi. Il coûte {prixCourt(C)}.
              </dd>
            </div>
            <div>
              <dt>Heure pleine</dt>
              <dd>
                Un créneau des plages {plagesHoraires(HEURES_PLEINES)} : la pause de midi et
                la fin de journée. Il coûte {prixCourt(P)}.
              </dd>
            </div>
          </dl>
          <Fondement regle={REGLES.prix} />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Ce qui est compris dans l’heure</h2>
          <p>
            L’accès à l’espace réservé et à tout son équipement fixe — rings, sacs de frappe,
            tatamis, cage ou octogone selon le club —, votre QR code d’entrée, et la présence de
            votre client, sans qu’il ait à être adhérent du club. Une réservation couvre un
            client, en cours privé.
          </p>
          <p>{REGLES.equipement.texte}</p>
          <Fondement regle={REGLES.equipement} />
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Vous ne payez que les heures que vous prenez</h2>
          <p>
            L’inscription est gratuite. Aucun mois ne vous est facturé si vous ne coachez pas,
            aucune caution n’est bloquée sur votre carte : chaque heure se paie quand vous la
            réservez, et c’est tout. Le jour où vous coachez trois fois, vous payez trois heures.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Un paiement, en une fois, à la réservation</h2>
          <p>
            {REGLES.paiement.texte} {REGLES.option.texte}
          </p>
          <p>{REGLES.signature.texte}</p>
          <Fondement regle={REGLES.paiement} />
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Le prix est garanti dès que vous réservez</h2>
          <p>{REGLES.prixFige.texte}</p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Annuler à temps : l’heure devient un avoir</h2>
          <p>{REGLES.annulation.texte}</p>
          <p>
            {REGLES.avoir.texte} Une heure creuse annulée à temps paie donc une autre heure
            creuse, dans n’importe quel club.
          </p>
          <Fondement regle={REGLES.annulation} />
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Les heures à réserver : du lundi au samedi, hors cours du club</h2>
          <p>
            {REGLES.grille.texte} {REGLES.coursDuClub.texte}
          </p>
          <p>
            Chaque heure libre est au prix de sa plage, quel que soit le club :{' '}
            <Link href="/clubs">voir les heures libres des cinq clubs</Link>.
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur les tarifs et les avoirs" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Réservez votre première heure</h2>
          <p>
            Pour voir ce que coûte une semaine de coaching selon votre rythme :{' '}
            <Link href="/location-salle-de-sport-a-l-heure-toulouse">le calcul, heure par heure</Link>.
            Retard, client mineur, porte fermée : <Link href="/faq">toutes les règles, question par question</Link>.
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

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} titre="Les sources des tarifs et des règles d’annulation" />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </div>
  )
}
