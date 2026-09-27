import Link from 'next/link'

import { metadataDeRoute, CLUB_PAGES } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { CLUBS_VERITE, RESEAU, adresseEnLigne } from '@/lib/seo/verite'
import type { ClubId } from '@/domain/contrat'

import { ContactForm } from './ContactForm'

export const metadata = metadataDeRoute('/contact')

/**
 * CONTACT.
 *
 * La page affichait, en sous-titre public : « Formulaire POST /contact (rate
 * limit 5 / h). Mail transactionnel = Lot Raphael. » Une note de développeur,
 * servie à chaque visiteur, sur la page où l'on vient justement parce qu'on a
 * une question. `scripts/verifier-aeo.mjs` cherche désormais ces mots-là sur
 * toutes les pages publiques.
 *
 * Le numéro affiché est celui du RÉSEAU, tiré du registre de vérité : c'est la
 * ligne de Boxing Center, pas une ligne dédiée aux réservations. Il est
 * présenté comme tel, pour qu'un coach sache à qui il parle.
 */

const slugDe = (id: ClubId) => CLUB_PAGES.find((c) => c.clubId === id)?.slug ?? id

export default function ContactPage() {
  const clubs = Object.values(CLUBS_VERITE)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="contact">
        <p className="sur mono">
          <Link href="/">Accueil</Link> / Contact
        </p>
        <h1>Contacter Boxing Center pour louer une salle</h1>
        <p className="reponse">
          Une question sur une location, un créneau ou votre compte coach : écrivez
          à l’équipe avec le formulaire ci-dessous. Pour le reste, le réseau Boxing
          Center répond au {RESEAU.telephone.affiche}.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Écrire à l’équipe</h2>
          <ContactForm />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Joindre le réseau Boxing Center</h2>
          <p>
            Téléphone :{' '}
            <a href={`tel:${RESEAU.telephone.e164}`}>{RESEAU.telephone.affiche}</a>
            <br />
            Site officiel :{' '}
            <a href={RESEAU.siteOfficiel.url} rel="noopener">
              boxingcenter.fr
            </a>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Les cinq adresses</h2>
          <ul className="clubs-faits">
            {clubs.map((c) => (
              <li key={c.id}>
                <h3>{c.nom.replace('Boxing Center ', '')}</h3>
                <address>{adresseEnLigne(c)}</address>
                <Link href={`/clubs/${slugDe(c.id)}`}>Heures libres et accès</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>La réponse est peut-être déjà là</h2>
          <ul className="regles">
            <li>
              <Link href="/tarifs">Tarifs, paiement et avoirs</Link>
            </li>
            <li>
              <Link href="/location-salle-coach-sportif-toulouse">
                Qui peut réserver, et ce que dit la loi
              </Link>
            </li>
            <li>
              <Link href="/comment-ca-marche">Le déroulé d’une réservation</Link>
            </li>
          </ul>
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Accueil', path: '/' },
          { name: 'Contact', path: '/contact' },
        ])}
      />
    </>
  )
}
