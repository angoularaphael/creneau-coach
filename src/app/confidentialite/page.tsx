import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { EDITEUR, REGISTRE_VERIFIE_LE } from '@/lib/seo/verite'

export const metadata = metadataDeRoute('/confidentialite')

/**
 * POLITIQUE DE CONFIDENTIALITÉ.
 *
 * La page affichait « Mentions RGPD — textes direction à coller » et, pour
 * exercer ses droits, des routes techniques en clair (`GET /me/export`,
 * `DELETE /me`). Elle décrit désormais ce que le produit fait RÉELLEMENT,
 * vérifié dans le code le 27/09/2026 :
 *
 *   · l'export des données existe dans l'espace coach (bouton « Exporter mes
 *     données ») — il est annoncé comme tel ;
 *   · la suppression n'a PAS de bouton : elle se demande par e-mail. Un
 *     profil qui a des réservations est désactivé et vidé, pas effacé en bloc,
 *     parce que les pièces comptables se conservent dix ans (Code de commerce,
 *     art. L123-22) ;
 *   · aucun numéro de carte n'est conservé : seul l'identifiant attribué par le
 *     prestataire de paiement l'est.
 *
 * Une politique qui promettrait un bouton absent serait fausse à la première
 * lecture, et c'est la page où l'on vient justement vérifier qu'on ne ment pas.
 */

const SOURCES = [
  {
    libelle: 'Règlement général sur la protection des données (RGPD), articles 15 à 21 — CNIL',
    url: 'https://www.cnil.fr/fr/reglement-europeen-protection-donnees',
  },
  {
    libelle: 'Code de commerce, article L123-22 — Légifrance',
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219327',
  },
  { libelle: 'CNIL — adresser une plainte', url: 'https://www.cnil.fr/fr/plaintes' },
  ...EDITEUR.sources,
]

export default function PrivacyPage() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="confidentialite">
        <h1>Politique de confidentialité</h1>
        <p className="page-hero__sous">
          {EDITEUR.raisonSociale} traite les données de votre compte coach pour gérer
          vos réservations, vos paiements, vos signatures et votre accès aux clubs.
          Voici lesquelles, pourquoi, et comment les récupérer ou les faire effacer.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Qui traite vos données</h2>
          <p>
            {EDITEUR.raisonSociale}, {EDITEUR.siege}. Contact :{' '}
            <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Les données collectées</h2>
          <ul className="regles">
            <li>
              <b>Votre identité</b> : prénom, nom, date de naissance, téléphone,
              e-mail, adresse postale.
            </li>
            <li>
              <b>Votre activité</b> : diplôme, disciplines enseignées, photo de
              profil et justificatifs.
            </li>
            <li>
              <b>Vos réservations</b> : club, espace, horaire, montant, avoirs.
            </li>
            <li>
              <b>Vos paiements</b> : montant et statut. Aucun numéro de carte n’est
              conservé — seul l’identifiant que vous attribue le prestataire de
              paiement.
            </li>
            <li>
              <b>Vos signatures et vos accès</b> : documents signés, et entrées
              dans les clubs le jour de vos créneaux.
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Pourquoi elles sont traitées</h2>
          <p>
            Pour exécuter le service que vous réservez : créer votre compte, tenir
            vos réservations, encaisser vos paiements, recueillir vos signatures et
            ouvrir la porte du club. Et pour respecter la loi : vérifier que vous
            êtes qualifié pour encadrer contre rémunération (Code du sport,
            article L212-1), et tenir la comptabilité. Les cases de consentement ne
            sont jamais pré-cochées.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Qui les reçoit</h2>
          <p>
            Les prestataires strictement nécessaires au service : paiement en
            ligne, signature électronique, contrôle d’accès des clubs, et
            hébergement — {EDITEUR.hebergeur.nom} pour le site,{' '}
            {EDITEUR.donnees.nom} pour les données, conservées dans l’
            {EDITEUR.donnees.region}. Le personnel d’un club ne voit que les
            réservations de son club.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Combien de temps elles sont conservées</h2>
          <p>
            Tant que votre compte est actif. Les pièces comptables — paiements,
            réservations payées — sont conservées dix ans, comme l’exige
            l’article L123-22 du Code de commerce.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Vos droits, et comment les exercer</h2>
          <p>
            Vous pouvez accéder à vos données, les faire corriger, les récupérer,
            vous opposer à un traitement ou demander leur effacement (RGPD,
            articles 15 à 21).
          </p>
          <ul className="regles">
            <li>
              <b>Récupérer vos données</b> : depuis votre espace coach, rubrique
              Profil, bouton « Exporter mes données ».
            </li>
            <li>
              <b>Corriger vos informations</b> : depuis la même rubrique.
            </li>
            <li>
              <b>Faire effacer votre compte</b> : par e-mail à{' '}
              <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>. Si vous avez
              déjà réservé, votre compte est désactivé et vos données d’identité anonymisées
              ; seules les pièces comptables restent, pour la durée légale.
            </li>
            <li>
              <b>Une réclamation</b> : auprès de la CNIL, sur{' '}
              <a href="https://www.cnil.fr/fr/plaintes" rel="noopener">
                cnil.fr
              </a>
              .
            </li>
          </ul>
        </div>
      </section>

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} />
    </>
  )
}
