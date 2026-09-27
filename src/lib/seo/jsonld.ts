/**
 * Données structurées JSON-LD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÈGLE D5 — RIEN QUI NE SOIT VRAI                                         │
 * │                                                                          │
 * │ Levée le 27/09/2026 pour ce qui est désormais VÉRIFIÉ : les cinq         │
 * │ adresses et le numéro du réseau, relevés sur boxingcenter.fr et          │
 * │ consignés dans `./verite.ts`. Ces faits ne s'écrivent pas ici : ils      │
 * │ viennent du registre, qui porte leur source et leur date.                │
 * │                                                                          │
 * │ MAINTENUE pour tout le reste : coordonnées, horaires, notes, avis. Les   │
 * │ types ci-dessous n'ont PAS ces champs ; les ajouter est une erreur de    │
 * │ compilation. `scripts/check-seo.mjs` refait le contrôle sur le HTML      │
 * │ servi, et vérifie que chaque adresse publiée est l'une des cinq du       │
 * │ registre, au caractère près.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Pourquoi pas `schema-dts` : la bibliothèque n'est pas installée, et l'ajouter
 * toucherait `package.json`, partagé par les trois lots. Elle accepterait par
 * ailleurs `address` sans broncher — elle type schema.org, elle ne connaît pas
 * D5. Les types locaux ci-dessous sont plus étroits, donc plus utiles ici.
 *
 * Référence : .research/spec-05-seo.md §11.
 */

import { LANGUE_BALISEE, SITE_NAME, SITE_URL, absoluteUrl } from './site'
import { CLUBS_VERITE, RESEAU, type ClubVerite } from './verite'
import { REGLAGES_DEFAUT, type ClubId } from '@/domain/contrat'

const CONTEXTE = 'https://schema.org' as const
type Contexte = typeof CONTEXTE

/** Identifiants stables, pour que les nœuds se référencent entre eux. */
export const ORG_ID = `${SITE_URL}/#organization`
export const SITE_ID = `${SITE_URL}/#website`

type Reference = { '@id': string }

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

/**
 * Volontairement minimal. Google : « There are no required properties ; instead,
 * add the properties that apply to your organization. » `address` y est
 * recommandée, pas obligatoire — c'est ce qui rend ce nœud publiable sans mentir.
 */
export type OrganisationJsonLd = {
  '@context': Contexte
  '@type': 'Organization'
  '@id': string
  name: string
  url: string
  logo: string
  /** Le numéro général du réseau, pris dans le registre. */
  telephone: string
  /**
   * Le site officiel du réseau. C'est la même organisation : le dire permet à
   * un moteur de relier ce site à l'entité Boxing Center qu'il connaît déjà,
   * au lieu d'en inventer une deuxième.
   */
  sameAs: readonly string[]

  // ---------------------------------------------------------------------------
  // À AJOUTER AU TYPE **ET** À LA FONCTION quand la direction fournit les faits,
  // un champ à la fois, chacun contre une confirmation écrite :
  //
  //   sameAs?: string[]      // comptes officiels (Instagram, Facebook…)
  //   email?: string         // adresse de contact publique
  //   telephone?: string     // format E.164, « +33… »
  //   vatID?: string         // « FR… »
  //   address?: AdressePostale
  //
  // Tant qu'un champ n'est pas dans ce type, l'écrire ne compile pas. C'est le
  // but. Voir .research/spec-05-seo.md §15.3.
  // ---------------------------------------------------------------------------
}

export function organizationJsonLd(): OrganisationJsonLd {
  return {
    '@context': CONTEXTE,
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    // Fichier réel, vérifié : public/images/logo.png, 186 × 88 px.
    logo: absoluteUrl('/images/logo.png'),
    telephone: RESEAU.telephone.e164,
    sameAs: [RESEAU.siteOfficiel.url],
  }
}

// ---------------------------------------------------------------------------
// WebSite
// ---------------------------------------------------------------------------

/**
 * Pas de `potentialAction` / `SearchAction` : il n'y a pas de moteur de recherche
 * interne. Déclarer une sitelinks searchbox qui n'existe pas est une promesse
 * non tenue, et Google la teste.
 */
export type SiteWebJsonLd = {
  '@context': Contexte
  '@type': 'WebSite'
  '@id': string
  name: string
  url: string
  inLanguage: string
  publisher: Reference
}

export function webSiteJsonLd(): SiteWebJsonLd {
  return {
    '@context': CONTEXTE,
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    inLanguage: LANGUE_BALISEE,
    publisher: { '@id': ORG_ID },
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * La location de créneaux elle-même.
 *
 * `offers` est volontairement absent du type : les tarifs viennent du serveur et
 * dépendent du créneau (heures creuses / heures pleines, CAHIER-API.md §3.4).
 * Figer un prix dans le balisage publierait une grille que le produit ne
 * respecte pas. À rouvrir seulement si la direction fige une grille publique.
 */
type OffreJsonLd = {
  '@type': 'Offer'
  name: string
  price: string
  priceCurrency: 'EUR'
  unitText: string
  url: string
}

export type ServiceJsonLd = {
  '@context': Contexte
  '@type': 'Service'
  name: string
  serviceType: string
  provider: Reference
  url: string
  areaServed: { '@type': 'AdministrativeArea'; name: string }
  /**
   * Les deux prix publics. L'ancienne version les écartait « tant que la
   * direction n'a pas figé une grille publique ». La grille est publique : le
   * cahier §8 la fixe et `/tarifs` l'affiche. La taire dans le balisage privait
   * les moteurs de réponse du fait qu'on leur demande le plus : combien.
   */
  offers: readonly OffreJsonLd[]
  /** Les cinq lieux où le service se consomme — chacun défini une seule fois, sur sa page. */
  availableAtOrFrom: readonly Reference[]
}

export function serviceJsonLd(): ServiceJsonLd {
  const euros = (cents: number) => (cents / 100).toFixed(2)
  return {
    '@context': CONTEXTE,
    '@type': 'Service',
    name: 'Location de créneaux pour coachs indépendants',
    serviceType: 'Location de salle de sport à l’heure pour coach sportif',
    provider: { '@id': ORG_ID },
    url: absoluteUrl('/'),
    areaServed: { '@type': 'AdministrativeArea', name: 'Toulouse et agglomération' },
    offers: [
      {
        '@type': 'Offer',
        name: 'Créneau d’une heure — heure creuse',
        price: euros(REGLAGES_DEFAUT.offpeak_cents),
        priceCurrency: 'EUR',
        unitText: 'heure',
        url: absoluteUrl('/tarifs'),
      },
      {
        '@type': 'Offer',
        name: 'Créneau d’une heure — heure pleine',
        price: euros(REGLAGES_DEFAUT.peak_cents),
        priceCurrency: 'EUR',
        unitText: 'heure',
        url: absoluteUrl('/tarifs'),
      },
    ],
    availableAtOrFrom: (Object.keys(CLUBS_VERITE) as ClubId[]).map((id) => ({ '@id': lieuId(id) })),
  }
}

// ---------------------------------------------------------------------------
// SportsActivityLocation — un par club
// ---------------------------------------------------------------------------

type AdressePostale = {
  '@type': 'PostalAddress'
  streetAddress: string
  postalCode: string
  addressLocality: string
  addressRegion: string
  addressCountry: 'FR'
}

/**
 * Le lieu. SANS `geo`, SANS `openingHoursSpecification`, SANS note : aucun des
 * trois n'est vérifié, et un lieu à moitié décrit vaut mieux qu'un lieu décrit
 * faux. `address` et `name` suffisent au type.
 *
 * `@id` stable, défini UNE SEULE FOIS, sur la page du club. Les autres pages le
 * référencent par cet identifiant, sans le redéclarer : une entité décrite deux
 * fois devient deux entités.
 */
export type LieuJsonLd = {
  '@context': Contexte
  '@type': 'SportsActivityLocation'
  '@id': string
  name: string
  url: string
  address: AdressePostale
  parentOrganization: Reference
  telephone: string
}

/** Dérivé de l'identifiant API, qui ne change pas quand le slug change. */
export function lieuId(clubId: ClubId): string {
  return `${SITE_URL}/#lieu-${clubId}`
}

export function lieuJsonLd(clubId: ClubId, cheminPage: string): LieuJsonLd {
  const c: ClubVerite = CLUBS_VERITE[clubId]
  return {
    '@context': CONTEXTE,
    '@type': 'SportsActivityLocation',
    '@id': lieuId(clubId),
    name: c.nom,
    url: absoluteUrl(cheminPage),
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.rue,
      postalCode: c.codePostal,
      addressLocality: c.ville,
      addressRegion: 'Occitanie',
      addressCountry: 'FR',
    },
    parentOrganization: { '@id': ORG_ID },
    telephone: RESEAU.telephone.e164,
  }
}

// ---------------------------------------------------------------------------
// FAQPage — uniquement le miroir d'une FAQ VISIBLE
// ---------------------------------------------------------------------------

export type QuestionReponse = { readonly question: string; readonly reponse: string }

export type FaqJsonLd = {
  '@context': Contexte
  '@type': 'FAQPage'
  mainEntity: Array<{
    '@type': 'Question'
    name: string
    acceptedAnswer: { '@type': 'Answer'; text: string }
  }>
}

/**
 * Le balisage FAQ ne se construit QU'À PARTIR de la liste affichée : la page
 * passe la même constante au composant visible et à cette fonction. Une FAQ
 * balisée sans équivalent visible est ce que Google sanctionne ; une FAQ visible
 * sans balisage prive les moteurs de réponse de la forme qu'ils citent le plus
 * (HubSpot, State of AEO 2026).
 */
export function faqJsonLd(items: readonly QuestionReponse[]): FaqJsonLd {
  if (items.length === 0) throw new Error('[seo/jsonld] FAQ vide : rien à baliser.')
  return {
    '@context': CONTEXTE,
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.reponse },
    })),
  }
}

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

export type ElementFilAriane = { name: string; path: string }

export type FilArianeJsonLd = {
  '@context': Contexte
  '@type': 'BreadcrumbList'
  itemListElement: Array<{
    '@type': 'ListItem'
    position: number
    name: string
    item: string
  }>
}

/**
 * Fil d'Ariane.
 *
 * `items` DOIT refléter le fil d'Ariane **visible** de la page
 * (docs/SEO-INFORMATION-ARCHITECTURE.md §7). Un balisage sans équivalent visible
 * est un balisage que Google ignore, dans le meilleur des cas.
 */
export function breadcrumbJsonLd(
  items: readonly ElementFilAriane[],
): FilArianeJsonLd {
  if (items.length === 0) {
    throw new Error('[seo/jsonld] Un fil d’Ariane vide ne doit pas être balisé.')
  }
  return {
    '@context': CONTEXTE,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

// ---------------------------------------------------------------------------
// Ce qu'on n'écrit PAS, et où le brancher le jour venu
// ---------------------------------------------------------------------------

/*
 * LocalBusiness / SportsActivityLocation — le balisage le plus rentable pour
 * cinq salles physiques dans une agglomération. Il ne vaut que par `address`,
 * `geo`, `telephone` et `openingHoursSpecification` : aucun de ces quatre faits
 * n'est confirmé (D5, MASTER-PROJECT-SPEC.md §18). Écrit aujourd'hui, il serait
 * faux ; écrit à moitié, il ne produirait aucun résultat enrichi.
 *
 * À AJOUTER ICI le jour où les faits arrivent, un club à la fois :
 *
 *   export type ClubJsonLd = {
 *     '@context': Contexte
 *     '@type': 'SportsActivityLocation'
 *     '@id': string                      // `${absoluteUrl(cheminClub(slug))}#club`
 *     name: string                       // « Boxing Center Minimes »
 *     parentOrganization: Reference      // { '@id': ORG_ID }
 *     url: string
 *     image: string                      // photo dont les droits sont confirmés
 *     address: AdressePostale            // <- fait confirmé requis
 *     geo: Coordonnees                   // <- fait confirmé requis
 *     telephone: string                  // <- fait confirmé requis
 *     openingHoursSpecification: […]     // <- fait confirmé requis
 *   }
 *
 * FAQPage — autorisé « uniquement pour une FAQ visible » et approuvée
 * (SEO-INFORMATION-ARCHITECTURE.md §5 et §6). Les questions ne sont pas écrites.
 * Le code est trivial ; ce n'est pas lui qui manque.
 *
 * `aggregateRating`, `review`, `ratingValue`, `reviewCount` — JAMAIS, même sur
 * demande. Ce sont des chiffres fabriqués, pas mesurés, et c'est la catégorie de
 * balisage que Google sanctionne.
 */
