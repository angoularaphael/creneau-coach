import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { EDITEUR, REGISTRE_VERIFIE_LE } from '@/lib/seo/verite'

export const metadata = metadataDeRoute('/mentions-legales')

/**
 * MENTIONS LÉGALES — obligation de la loi pour la confiance dans l'économie
 * numérique (LCEN), article 6-III-1 : identité de l'éditeur, directeur de la
 * publication, hébergeur.
 *
 * La page affichait en sous-titre public « Textes direction à intégrer —
 * placeholder Lot B ». Chaque ligne vient désormais du registre de vérité,
 * lui-même relevé sur le site officiel du réseau et recoupé sur le registre
 * public des entreprises.
 */
export default function MentionsPage() {
  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel="mentions-legales">
        <h1>Mentions légales</h1>
        <p className="page-hero__sous">
          Ce site est édité par {EDITEUR.raisonSociale}, qui exploite les cinq clubs
          Boxing Center de l’agglomération toulousaine.
        </p>
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Éditeur du site</h2>
          <p>
            {EDITEUR.raisonSociale}, société par actions simplifiée au capital de{' '}
            {EDITEUR.capital}
            <br />
            SIREN {EDITEUR.siren} — {EDITEUR.rcs}
            <br />
            Siège social : {EDITEUR.siege}
            <br />
            Contact : <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Directeur de la publication</h2>
          <p>{EDITEUR.directeurPublication}</p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Hébergement</h2>
          <p>
            Site : {EDITEUR.hebergeur.nom}, {EDITEUR.hebergeur.adresse}.
            <br />
            Données des comptes et des réservations : {EDITEUR.donnees.nom}, hébergées
            dans l’{EDITEUR.donnees.region}.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Propriété des contenus</h2>
          <p>
            Les textes, visuels et le logo Boxing Center présents sur ce site
            appartiennent à {EDITEUR.raisonSociale}. Leur reproduction sans
            autorisation écrite est interdite.
          </p>
        </div>
      </section>

      <Sources
        items={[...EDITEUR.sources, EDITEUR.hebergeur.source]}
        verifieLe={REGISTRE_VERIFIE_LE}
        titre="Les sources de l’identité de l’éditeur"
      />
    </>
  )
}
