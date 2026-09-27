import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import { HEURES_CREUSES, HEURES_PLEINES, REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'

export const metadata = metadataDeRoute('/tarifs')

/**
 * TARIFS — les règles de l'argent.
 *
 * La page tenait en deux cartes et une note : « Annulation > 24 h avant → avoir
 * du montant de la résa. Moins de 24 h → trop tard. » Des flèches, une
 * abréviation, et une fin de phrase qui ferme la porte. Et les prix y étaient
 * écrits en dur (`formatCents(1000)`), à côté d'un domaine qui les porte déjà.
 *
 * SON ANGLE, DISTINCT DE « SALLE À L'HEURE » : cette page-ci dit les RÈGLES —
 * ce qui est compris, comment on paie, ce que devient une heure annulée. Le
 * calcul d'une semaine de coaching vit sur l'autre page ; les deux se lient.
 * Deux pages sur le même sujet sans angle propre se mangent l'une l'autre dans
 * les résultats.
 *
 * Le cahier §15 fixe la règle d'annulation, et la page la suit à la lettre :
 * paiement en une fois, pas de remboursement, un avoir du même montant si
 * l'annulation arrive plus de 24 h avant. L'absence de remboursement est dite —
 * dans la FAQ, là où quelqu'un la cherche, jamais en tête de page.
 */

const C = REGLAGES_DEFAUT.offpeak_cents
const P = REGLAGES_DEFAUT.peak_cents
const plages = (heures: readonly number[]) => {
  // Regroupe les heures qui se suivent : [10, 11, 14, 15, 16] → « 10 h-12 h, 14 h-17 h ».
  const blocs: [number, number][] = []
  for (const h of [...heures].sort((a, b) => a - b)) {
    const dernier = blocs[blocs.length - 1]
    if (dernier && dernier[1] === h) dernier[1] = h + 1
    else blocs.push([h, h + 1])
  }
  return blocs.map(([a, b]) => `${a} h-${b} h`).join(' et ')
}

const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Une heure annulée est-elle remboursée ?',
    reponse:
      'Non : plus de 24 heures avant le créneau, l’annulation donne un avoir du même montant, utilisable sur une autre heure. Il n’y a pas de remboursement sur la carte.',
  },
  {
    question: 'Peut-on utiliser un avoir dans un autre club ?',
    reponse:
      'Oui. L’avoir n’est attaché à aucun club ni à aucun espace : il se déduit de n’importe quelle prochaine réservation.',
  },
  {
    question: 'Que se passe-t-il si j’annule moins de 24 heures avant ?',
    reponse:
      'L’annulation n’est plus possible et l’heure reste due. À moins d’un jour, la place ne peut plus être proposée à temps à un autre coach.',
  },
  {
    question: 'Peut-on payer en plusieurs fois ?',
    reponse:
      'Non. Chaque heure se règle en une fois, au moment de la réservation. Elle n’est confirmée qu’une fois le paiement accepté.',
  },
  {
    question: 'Les prix sont-ils les mêmes pour tous les espaces ?',
    reponse: `Oui. Ring, sacs, tatamis ou espace MMA : le prix dépend uniquement de l’heure, ${prixCourt(C)} en heure creuse et ${prixCourt(P)} en heure pleine.`,
  },
]

export default function TarifsPage() {
  return (
    <div data-geste="rebond">
      <header className="page-hero page-hero--visuel" data-visuel="tarifs">
        <p className="sur mono">Deux prix, c’est tout</p>
        <h1>
          Tarifs : {prixCourt(C)} l’heure creuse, {prixCourt(P)} l’heure pleine
        </h1>
        <p className="reponse">
          Une heure de salle coûte {prixCourt(C)} en heure creuse et {prixCourt(P)} en
          heure pleine, dans les cinq clubs Boxing Center. Le prix est affiché avant
          le paiement et ne bouge plus une fois l’heure réservée.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Deux prix, fixés par l’heure de début</h2>
          <div className="comparatif">
            <table>
              <caption>Du lundi au samedi, dans les cinq clubs.</caption>
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
                  <td>{plages(HEURES_CREUSES)}</td>
                </tr>
                <tr>
                  <th scope="row">Heure pleine</th>
                  <td>{prixCourt(P)}</td>
                  <td>{plages(HEURES_PLEINES)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Ce qui est compris dans l’heure</h2>
          <p>
            L’accès à l’espace réservé et à tout son équipement fixe — rings, sacs
            de frappe, tatamis, cage ou octogone selon le club —, votre QR code
            d’entrée, et la présence de vos clients sans qu’ils aient à être
            adhérents. Vous n’apportez que l’équipement individuel.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Sans abonnement, sans caution, sans frais d’inscription</h2>
          <p>
            L’inscription est gratuite. Aucun mois ne vous est facturé si vous ne
            coachez pas, aucune caution n’est bloquée sur votre carte. Vous payez
            l’heure que vous prenez, et c’est tout.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Un paiement, en une fois, à la réservation</h2>
          <p>
            L’heure se règle par carte au moment où vous la réservez, ou avec un
            avoir que vous avez déjà. La place vous est gardée dix minutes le temps
            du paiement, puis confirmée dès qu’il est accepté.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Le prix est garanti dès que vous réservez</h2>
          <p>
            Le montant est fixé à l’instant de la réservation. Si la grille évolue
            ensuite, les heures que vous avez déjà prises gardent leur prix.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Annuler à temps : l’heure devient un avoir</h2>
          <p>
            Jusqu’à 24 heures avant le créneau, vous annulez depuis votre espace et
            le montant vous revient en avoir, utilisable sur n’importe quelle autre
            heure, dans n’importe quel club. Une heure creuse annulée à temps paie
            une autre heure creuse.
          </p>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions sur les tarifs et les avoirs" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Choisissez votre heure</h2>
          <p>
            Pour voir ce que coûte une semaine de coaching selon votre rythme :{' '}
            <Link href="/location-salle-de-sport-a-l-heure-toulouse">le calcul, heure par heure</Link>.
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

      <JsonLd
        data={[
          serviceJsonLd(),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Tarifs', path: '/tarifs' },
          ]),
        ]}
      />
    </div>
  )
}
