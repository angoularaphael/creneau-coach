import Link from 'next/link'

import { Faq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { Fondement } from '@/components/aeo/Fondement'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { pageWebJsonLd, serviceJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'
import { GARANTIES_DU_COACH, LOI, REGISTRE_VERIFIE_LE, REGLES, type Source } from '@/lib/seo/verite'
import { REGLAGES_DEFAUT, prixCourt } from '@/domain/contrat'
import '@/styles/contenu.css'

const CHEMIN = '/devenir-coach-partenaire'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * DEVENIR COACH PARTENAIRE — les conditions pour coacher dans les clubs.
 *
 * `docs/SEO-INFORMATION-ARCHITECTURE.md` §3 prévoyait : « profil, diplômes,
 * validation, responsabilités ». Trois de ces quatre mots sont écrits ici ;
 * le quatrième ne l'est pas, parce qu'il n'existe pas : le produit n'a AUCUNE
 * étape de validation de dossier (aucun statut « en attente », aucun écran de
 * revue au back-office). Écrire « votre dossier est validé sous 48 h » serait
 * inventer un processus — et un moteur de réponse le répéterait. La page dit
 * ce qui est vrai : le compte s'ouvre, le coach GARANTIT ses qualifications
 * (CG art. 5.1), et Boxing Center peut demander les justificatifs à tout
 * moment, sous huit jours (art. 5.2).
 *
 * Toutes les conditions viennent du registre (`REGLES`, articles 4, 5 et 12
 * des CG) et du Code du sport (`LOI`). Le H1 ne porte pas « partenaire » : le
 * contrat dit l'inverse d'un partenariat — indépendance, aucun lien de
 * subordination (art. 5.3). Le mot reste dans l'adresse et le titre court,
 * parce que c'est celui que la carte de routes a fixé.
 *
 * L'ANGLE COMMERCIAL : ce que le coach GARDE (ses clients, ses tarifs, 100 %
 * de ce qu'il facture) passe avant ce qu'il doit fournir. Les conditions sont
 * dites en entier, mais elles se lisent comme ce qu'elles sont — la preuve
 * qu'on coache ici entre professionnels.
 *
 * Pas de visuel de héros dédié pour l'instant : voir le rapport (image GPT
 * Image à générer, jamais une photo empruntée à une autre page).
 */

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)


const QUESTIONS: readonly QuestionReponse[] = [
  {
    question: 'Faut-il une carte professionnelle pour louer une salle et y coacher ?',
    reponse: `Oui, dès que vous êtes payé pour encadrer. Le Code du sport réserve l’encadrement rémunéré aux personnes qualifiées (article ${LOI.qualification.article}) et impose de déclarer son activité (article ${LOI.declaration.article}) ; les conditions générales reprennent les deux, avec la carte professionnelle en cours de validité.`,
  },
  {
    question: 'Quelle assurance faut-il avoir ?',
    reponse: `Une assurance de responsabilité civile professionnelle en cours de validité. ${GARANTIES_DU_COACH.items[4]?.texte ?? ''}`,
  },
  {
    question: 'Faut-il être micro-entrepreneur ?',
    reponse:
      'Il faut exercer sous un numéro SIREN valide. Le contrat n’impose pas de forme : micro-entreprise ou société, c’est votre choix.',
  },
  {
    question: 'Mon dossier doit-il être validé avant ma première réservation ?',
    reponse: `Non : en ouvrant votre compte, vous déclarez et garantissez remplir les conditions. En contrepartie, ${REGLES.justificatifs.texte.charAt(0).toLowerCase()}${REGLES.justificatifs.texte.slice(1)}`,
  },
  {
    question: 'Puis-je enseigner plusieurs disciplines ?',
    reponse:
      'Oui, toutes celles pour lesquelles vous êtes qualifié : la qualification s’apprécie discipline par discipline. Boxe, MMA ou préparation physique, chaque discipline enseignée contre rémunération demande son diplôme.',
  },
]

const SOURCES: readonly Source[] = [
  REGLES.inscription.source,
  REGLES.qualification.source,
  REGLES.securite.source,
  REGLES.unClient.source,
  LOI.qualification.source,
  { libelle: LOI.registrePublic.libelle, url: LOI.registrePublic.url },
]

export default function DevenirCoachPage() {
  return (
    <>
      <header className="page-hero">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Devenir coach partenaire', path: CHEMIN },
          ]}
        />
        <h1>Coacher dans les clubs Boxing Center : les conditions à remplir</h1>
        <p className="reponse">
          Pour louer une salle Boxing Center à l’heure et y coacher vos clients, il faut être
          majeur, diplômé pour les disciplines enseignées, déclaré avec une carte
          professionnelle valide, immatriculé et assuré en responsabilité civile
          professionnelle. Le compte est gratuit, et vous restez libre de vos clients, de vos
          méthodes et de vos tarifs.
        </p>
        <MisAJour chemin={CHEMIN} />
      </header>

      <section className="section">
        <div className="enveloppe">
          <h2>Vos clients, vos méthodes, vos tarifs : vous restez indépendant</h2>
          <p>
            {REGLES.independance.texte} Vous ne payez que l’heure de salle — {creuse} en heure
            creuse, {pleine} en heure pleine — et tout ce que vous facturez à vos clients vous
            revient.
          </p>
          <ul className="chiffres">
            <li>
              <b>0 €</b>
              <span>pour ouvrir votre compte coach</span>
            </li>
            <li>
              <b>{creuse}</b>
              <span>l’heure creuse, dans les cinq clubs</span>
            </li>
            <li>
              <b>{pleine}</b>
              <span>l’heure pleine, dans les cinq clubs</span>
            </li>
            <li>
              <b>0 %</b>
              <span>prélevé sur ce que vous facturez à vos clients</span>
            </li>
          </ul>
          <Fondement regle={REGLES.independance} />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Les cinq garanties que vous apportez</h2>
          <p>
            {REGLES.inscription.texte} En réservant, vous garantissez, pendant toute la durée de
            votre compte :
          </p>
          <ul className="regles">
            {GARANTIES_DU_COACH.items.map((g) => (
              <li key={g.titre}>
                <b>{g.titre}.</b> {g.texte}
              </li>
            ))}
          </ul>
          <Fondement regle={REGLES.qualification} />
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Votre carte professionnelle se vérifie sur le registre public</h2>
          <p>
            Le ministère des Sports publie le registre des éducateurs sportifs déclarés :
            n’importe qui — un client, un club — peut y vérifier une carte.{' '}
            <a href={LOI.registrePublic.url} rel="noopener" target="_blank">
              Rechercher un éducateur sur le registre EAPS
            </a>
            .
          </p>
          <p>
            Encadrer contre rémunération sans la qualification requise est puni de{' '}
            {LOI.sanctionQualification.texte} (article {LOI.sanctionQualification.article}) ;
            ne pas déclarer son activité, de la même peine (article{' '}
            {LOI.sanctionDeclaration.article}). Le détail de la loi est sur la page{' '}
            <Link href="/location-salle-coach-sportif-toulouse">location de salle pour coach sportif</Link>.
          </p>
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Les justificatifs : sur demande, sous huit jours</h2>
          <p>
            {REGLES.justificatifs.texte} Un justificatif manquant ou invalide peut entraîner
            la suspension du compte, après que vous avez pu présenter vos observations.
          </p>
          <p>{REGLES.suspension.texte}</p>
          <Fondement regle={REGLES.justificatifs} />
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Pendant la séance, la sécurité de votre client vous revient</h2>
          <p>{REGLES.securite.texte}</p>
          <p>{REGLES.assuranceClient.texte}</p>
          <p>{REGLES.unClient.texte}</p>
          <Fondement regle={REGLES.securite} />
        </div>
      </section>

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>Ce que vous pouvez dire de Boxing Center à vos clients</h2>
          <p>{REGLES.marque.texte}</p>
          <p>
            Concrètement : « je coache au Boxing Center des Minimes » est exact et permis ;
            mettre le logo Boxing Center sur vos cartes ou vos réseaux demande d’abord un accord
            écrit.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="enveloppe">
          <h2>Ouvrir son compte coach, en trois temps</h2>
          <ol className="etapes-aeo">
            <li>
              <div>
                <h3>Vous créez votre compte</h3>
                <p>
                  Prénom, nom, adresse e-mail et mot de passe, votre accord aux conditions, puis le
                  lien de confirmation reçu par e-mail.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous complétez votre profil professionnel</h3>
                <p>Téléphone, ville, diplôme et photo, depuis votre espace coach.</p>
              </div>
            </li>
            <li>
              <div>
                <h3>Vous réservez votre première heure</h3>
                <p>
                  Sur le planning d’un club, au prix affiché — puis paiement, signature à l’écran
                  et QR code d’accès.{' '}
                  <Link href="/comment-ca-marche">Le déroulé complet</Link>.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <Faq items={QUESTIONS} titre="Les questions avant de coacher dans les clubs" />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Ouvrez votre compte coach</h2>
          <p>Gratuit, sans engagement : vous ne payez que les heures que vous réservez.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/auth/inscription">
              Créer mon compte coach
            </Link>
            <Link className="btn btn-ghost" href="/clubs">
              Voir les créneaux libres
            </Link>
          </div>
        </div>
      </section>

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} titre="Les sources : Code du sport et conditions générales" />

      <JsonLd data={[serviceJsonLd(), pageWebJsonLd(CHEMIN, { surLeService: true })]} />
    </>
  )
}
