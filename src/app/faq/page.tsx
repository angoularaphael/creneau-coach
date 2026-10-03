import Link from 'next/link'

import { FaqParTheme, type ThemeFaq } from '@/components/aeo/Faq'
import { FilAriane } from '@/components/aeo/FilAriane'
import { MisAJour } from '@/components/aeo/MisAJour'
import { Sources } from '@/components/aeo/Sources'
import { metadataDeRoute } from '@/lib/seo'
import { JsonLd } from '@/lib/seo/json-ld'
import { pageWebJsonLd } from '@/lib/seo/jsonld'
import { LOI, REGISTRE_VERIFIE_LE, REGLES, RESEAU, type Source } from '@/lib/seo/verite'
import {
  DERNIERE_HEURE_DEBUT,
  PREMIERE_HEURE,
  REGLAGES_DEFAUT,
  prixCourt,
} from '@/domain/contrat'
import '@/styles/contenu.css'

const CHEMIN = '/faq'
export const metadata = metadataDeRoute(CHEMIN)

/**
 * /faq — LES RÈGLES DU SERVICE, QUESTION PAR QUESTION.
 *
 * `docs/SEO-INFORMATION-ARCHITECTURE.md` §3 pose la contrainte : « réponses
 * validées, sans duplications artificielles ». D'où deux règles d'écriture :
 *
 * 1. AUCUNE QUESTION RECOPIÉE D'UNE AUTRE PAGE. Les FAQ de /tarifs, des pages
 *    « location » et des clubs répondent déjà à « combien ? » et « où ? ». Ici
 *    vivent les questions que personne d'autre ne traite : la demi-heure,
 *    l'accès libre, le retard, la porte qui ne s'ouvre pas, le client mineur,
 *    la suspension. Une FAQ qui répète les autres pages est une page satellite
 *    — elle coule avec elles.
 *
 * 2. CHAQUE RÉPONSE VIENT DU REGISTRE (`REGLES`), donc d'un article du contrat
 *    que le coach signe. Les chiffres (10 minutes, 24 heures, 5 minutes) sont
 *    lus dans `REGLAGES_DEFAUT`. Une réponse qui contredirait les conditions
 *    générales n'est pas écrivable ici sans modifier le registre — c'est-à-dire
 *    sans que quelqu'un relise l'article.
 *
 * UN SEUL `FAQPage` pour les sept thèmes (`FaqParTheme`) : plusieurs nœuds
 * FAQ sur une page n'en désignent aucun comme principal.
 *
 * Pas de visuel de héros : il n'existe pas encore d'image dédiée à cette page
 * (consigne d'Eddy : Higgsfield, GPT Image, une image par page, jamais une
 * photo recyclée). Le héros est typographique en attendant — voir le rapport.
 */

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)
const finDeJournee = DERNIERE_HEURE_DEBUT + 1

const THEMES: readonly ThemeFaq[] = [
  {
    id: 'horaires',
    titre: 'Horaires : du lundi au samedi, hors cours du club',
    items: [
      {
        question: 'Pourquoi certaines heures affichent-elles « Cours du club » ?',
        reponse: `Parce qu’à cette heure-là, le club donne un cours dans cet espace. ${REGLES.coursDuClub.texte} Le planning en ligne les montre avant que vous choisissiez.`,
      },
      {
        question: 'Peut-on réserver pendant l’accès libre des adhérents ?',
        reponse: `Oui. L’accès libre n’est pas un cours : l’heure se réserve comme les autres. ${REGLES.partage.texte}`,
      },
      {
        question: 'Un créneau peut-il commencer à la demi-heure ?',
        reponse: `Chaque créneau dure une heure pleine et commence à l’heure ronde : le premier à ${PREMIERE_HEURE} h, le dernier à ${DERNIERE_HEURE_DEBUT} h. Pour une séance de deux heures, réservez deux créneaux qui se suivent.`,
      },
      {
        question: 'Que se passe-t-il si j’arrive en retard ?',
        reponse: REGLES.retard.texte,
      },
    ],
  },
  {
    id: 'paiement',
    titre: 'Payer : par carte ou avec un avoir, en une seule fois',
    items: [
      {
        question: 'Combien de temps la place est-elle gardée pendant le paiement ?',
        reponse: REGLES.option.texte,
      },
      {
        question: 'Peut-on compléter un avoir avec la carte bancaire ?',
        reponse: `Non. ${REGLES.avoir.texte.replace(/^Un avoir est valable[^.]*\. /, '')} Si votre avoir ne couvre pas le prix de l’heure, réglez-la entièrement par carte : l’avoir reste sur votre compte.`,
      },
      {
        question: 'Les prix affichés sont-ils toutes taxes comprises ?',
        reponse: `Oui. ${REGLES.prix.texte}`,
      },
    ],
  },
  {
    id: 'signature',
    titre: 'Signer : à l’écran, après chaque paiement',
    items: [
      {
        question: 'Quels documents signe-t-on, et à quel moment ?',
        reponse: REGLES.signature.texte,
      },
      {
        question: 'Faut-il signer à chaque réservation ?',
        reponse:
          'Oui. Chaque réservation porte sur les documents en vigueur le jour où elle est faite : la signature suit chaque paiement, en une seule fois pour les trois documents, depuis votre téléphone.',
      },
      {
        question: 'Comment garder une preuve de ce que j’ai signé ?',
        reponse: `${REGLES.attestation.texte} Elle indique le document, sa version, la date et l’heure de la signature.`,
      },
    ],
  },
  {
    id: 'acces',
    titre: 'Entrer au club : un QR code à votre nom, pour votre heure',
    items: [
      {
        question: 'Quand mon QR code s’active-t-il ?',
        reponse: REGLES.qr.texte,
      },
      {
        question: 'Puis-je transmettre mon QR code à mon client ?',
        reponse: `Non. ${REGLES.qrPersonnel.texte}`,
      },
      {
        question: 'Que faire si la porte ne s’ouvre pas ?',
        reponse: `${REGLES.accesImpossible.texte} Le réseau Boxing Center répond au ${RESEAU.telephone.affiche}.`,
      },
    ],
  },
  {
    id: 'annulation',
    titre: 'Annuler : ce que devient l’heure payée',
    items: [
      {
        question: 'L’avoir a-t-il une date limite ?',
        reponse:
          'Non, sauf durée différente indiquée au moment où il est émis. Il est attaché à votre compte, personnel, et sert dans tous les clubs et tous les espaces.',
      },
      {
        question: 'Et si c’est Boxing Center qui annule mon créneau ?',
        reponse: REGLES.annulationParLeClub.texte,
      },
      {
        question: 'Mon client ne vient pas : l’heure est-elle perdue ?',
        reponse: `${REGLES.absence.texte} Si vous savez plus de ${REGLAGES_DEFAUT.cancel_min_hours} heures avant que la séance n’aura pas lieu, annulez-la depuis votre espace : l’heure devient un avoir du même montant.`,
      },
    ],
  },
  {
    id: 'client',
    titre: 'Votre client : un seul, majeur, sous votre responsabilité',
    items: [
      {
        question: 'Mon client peut-il être mineur ?',
        reponse: REGLES.unClient.texte,
      },
      {
        question: 'Que doivent apporter le coach et son client ?',
        reponse: `${REGLES.equipement.texte} Des chaussures de sport propres, réservées à l’intérieur, sont obligatoires hors des surfaces de combat.`,
      },
      {
        question: 'Mon client doit-il être assuré ?',
        reponse: `${REGLES.assuranceClient.texte} Le coach, lui, doit être assuré en responsabilité civile professionnelle.`,
      },
    ],
  },
  {
    id: 'compte',
    titre: 'Votre compte coach : gratuit, et votre activité reste la vôtre',
    items: [
      {
        question: 'Qui peut ouvrir un compte coach ?',
        reponse: `${REGLES.inscription.texte} Le coach garantit être diplômé, déclaré, immatriculé et assuré.`,
      },
      {
        question: 'Boxing Center prend-il une commission sur mes séances ?',
        reponse: `Non. ${REGLES.independance.texte} Vous ne payez que l’heure de salle, ${creuse} ou ${pleine}.`,
      },
      {
        question: 'Que deviennent mes réservations si mon compte est suspendu ?',
        reponse: REGLES.suspension.texte,
      },
    ],
  },
]

const SOURCES: readonly Source[] = [
  REGLES.grille.source,
  REGLES.partage.source,
  REGLES.inscription.source,
  REGLES.qualification.source,
  REGLES.option.source,
  REGLES.prix.source,
  REGLES.qr.source,
  REGLES.signature.source,
  REGLES.annulation.source,
  REGLES.annulationParLeClub.source,
  REGLES.securite.source,
  REGLES.suspension.source,
  REGLES.equipement.source,
  REGLES.chaussures.source,
  LOI.qualification.source,
  RESEAU.telephone.source,
]

export default function FaqPage() {
  return (
    <>
      <header className="page-hero">
        <FilAriane
          items={[
            { name: 'Accueil', path: '/' },
            { name: 'Questions fréquentes', path: CHEMIN },
          ]}
        />
        <h1>Questions fréquentes : les règles pour réserver une salle quand on est coach</h1>
        <p className="reponse">
          Un coach réserve une heure du lundi au samedi entre {PREMIERE_HEURE} h et{' '}
          {finDeJournee} h, hors cours du club, la paie en ligne {creuse} ou {pleine}, signe à
          l’écran les documents du club, puis entre avec un QR code actif{' '}
          {REGLAGES_DEFAUT.qr_early_minutes} minutes avant son heure. Il peut annuler jusqu’à{' '}
          {REGLAGES_DEFAUT.cancel_min_hours} heures avant contre un avoir du même montant, et
          chaque réservation couvre un client, en cours privé.
        </p>
        <MisAJour chemin={CHEMIN} />
        <nav aria-label="Thèmes de la page">
          <ul className="sommaire-themes">
            {THEMES.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`}>{t.titre.split(' :')[0]}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <FaqParTheme themes={THEMES} />

      <section className="section section--final">
        <div className="enveloppe">
          <h2 className="final__titre">Une question sans réponse ici ?</h2>
          <p>
            Les prix en détail sont sur la page{' '}
            <Link href="/tarifs">tarifs</Link>, le déroulé d’une réservation sur{' '}
            <Link href="/comment-ca-marche">comment ça marche</Link>, et les conditions pour
            coacher dans les clubs sur{' '}
            <Link href="/devenir-coach-partenaire">devenir coach partenaire</Link>.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/clubs">
              Voir les créneaux libres
            </Link>
            <Link className="btn btn-ghost" href="/contact">
              Écrire à l’équipe
            </Link>
          </div>
        </div>
      </section>

      <Sources items={SOURCES} verifieLe={REGISTRE_VERIFIE_LE} titre="Les sources : le contrat, article par article" />

      <JsonLd data={pageWebJsonLd(CHEMIN)} />
    </>
  )
}
