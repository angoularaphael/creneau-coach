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

import { getRoute } from './routes'
import { LANGUE_BALISEE, SITE_NAME, SITE_URL, absoluteUrl } from './site'
import { CLUBS_VERITE, RESEAU, type ClubVerite } from './verite'
import { REGLAGES_DEFAUT, type ClubId } from '@/domain/contrat'

const CONTEXTE = 'https://schema.org' as const
type Contexte = typeof CONTEXTE

/** Identifiants stables, pour que les nœuds se référencent entre eux. */
export const ORG_ID = `${SITE_URL}/#organization`
export const SITE_ID = `${SITE_URL}/#website`
/**
 * Le service a SON identifiant depuis le 02/10/2026. Il était émis sans `@id`
 * sur six pages : six nœuds anonymes, donc six services distincts aux yeux d'un
 * moteur. Il est désormais le même partout, au caractère près (une seule
 * fonction le fabrique), et chaque page qui en parle le désigne par `about`.
 */
export const SERVICE_ID = `${SITE_URL}/#service`

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
  // `telephone` et `sameAs` sont posés depuis le 27/09/2026 (registre de
  // vérité). RESTENT À AJOUTER AU TYPE **ET** À LA FONCTION quand la direction
  // fournit les faits, un champ à la fois, chacun contre une confirmation :
  //
  //   sameAs (suite)            // comptes officiels (Instagram, Facebook…)
  //   vatID?: string            // « FR… » — le régime de TVA est une question ouverte
  //   address?: AdressePostale  // le siège est connu (EDITEUR.siege), mais le
  //                             // publier sur l'Organization est une décision
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
 * ── DEUX PROPRIÉTÉS HORS DE LEUR TYPE, CORRIGÉES LE 02/10/2026 ───────────
 *
 * `unitText` était posé sur `Offer` : schema.org ne le connaît que sur
 * `UnitPriceSpecification`, `QuantitativeValue` et quelques autres. Le prix
 * « à l'heure » se dit donc dans un `priceSpecification` (unité UN/CEFACT
 * `HUR` = heure), pas à côté.
 *
 * `availableAtOrFrom` était posé sur `Service` : son domaine est `Offer` et
 * `Demand`. Les cinq lieux passent donc dans chaque offre — c'est d'ailleurs
 * plus juste : c'est l'heure à 10 € qui est disponible aux Minimes.
 *
 * Un validateur tolérant ne dit rien de ces deux fautes ; un moteur qui lit le
 * vocabulaire à la lettre ignore la propriété, et le prix à l'heure disparaît
 * de ce qu'il sait.
 */
type PrixUnitaireJsonLd = {
  '@type': 'UnitPriceSpecification'
  price: string
  priceCurrency: 'EUR'
  /** Code UN/CEFACT de l'heure. */
  unitCode: 'HUR'
  unitText: string
  /** Les prix des CG sont « toutes taxes comprises » (art. 7.1). */
  valueAddedTaxIncluded: true
}

type OffreJsonLd = {
  '@type': 'Offer'
  name: string
  price: string
  priceCurrency: 'EUR'
  priceSpecification: PrixUnitaireJsonLd
  url: string
  /** Les lieux où l'offre se consomme — chacun défini une seule fois, sur sa page. */
  availableAtOrFrom: readonly Reference[]
}

export type ServiceJsonLd = {
  '@context': Contexte
  '@type': 'Service'
  '@id': string
  name: string
  serviceType: string
  provider: Reference
  url: string
  areaServed: { '@type': 'AdministrativeArea'; name: string }
  /** À qui le service s'adresse : des professionnels, pas des adhérents. */
  audience: { '@type': 'BusinessAudience'; audienceType: string }
  /**
   * Les deux prix publics. L'ancienne version les écartait « tant que la
   * direction n'a pas figé une grille publique ». La grille est publique : le
   * cahier §8 la fixe, les CG art. 7.1 l'écrivent et `/tarifs` l'affiche. La
   * taire dans le balisage privait les moteurs de réponse du fait qu'on leur
   * demande le plus : combien.
   */
  offers: readonly OffreJsonLd[]
}

export function serviceJsonLd(): ServiceJsonLd {
  const euros = (cents: number) => (cents / 100).toFixed(2)
  const lieux = (Object.keys(CLUBS_VERITE) as ClubId[]).map((id) => ({ '@id': lieuId(id) }))
  const offre = (name: string, cents: number): OffreJsonLd => ({
    '@type': 'Offer',
    name,
    price: euros(cents),
    priceCurrency: 'EUR',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: euros(cents),
      priceCurrency: 'EUR',
      unitCode: 'HUR',
      unitText: 'heure',
      valueAddedTaxIncluded: true,
    },
    url: absoluteUrl('/tarifs'),
    availableAtOrFrom: lieux,
  })
  return {
    '@context': CONTEXTE,
    '@type': 'Service',
    '@id': SERVICE_ID,
    name: 'Location de créneaux pour coachs indépendants',
    serviceType: 'Location de salle de sport à l’heure pour coach sportif',
    provider: { '@id': ORG_ID },
    url: absoluteUrl('/'),
    areaServed: { '@type': 'AdministrativeArea', name: 'Toulouse et agglomération' },
    audience: { '@type': 'BusinessAudience', audienceType: 'Coachs sportifs indépendants' },
    offers: [
      offre('Créneau d’une heure — heure creuse', REGLAGES_DEFAUT.offpeak_cents),
      offre('Créneau d’une heure — heure pleine', REGLAGES_DEFAUT.peak_cents),
    ],
  }
}

// ---------------------------------------------------------------------------
// WebPage — la page-réponse, datée
// ---------------------------------------------------------------------------

/**
 * Le nœud qui porte la FRAÎCHEUR de la page. `dateModified` et `datePublished`
 * viennent de `routes.data.json`, où ils sont les dates réelles des commits —
 * la même valeur que le « Mis à jour le » visible et le `lastmod` du sitemap.
 * Une date de build vendue comme date de mise à jour est, pour la skill
 * `aeo-geo` §4, pire qu'une date absente : les champs ne sortent donc que
 * s'ils sont posés à la main.
 *
 * `breadcrumb` désigne le fil d'Ariane de la page par son `@id` ; le composant
 * `FilAriane` le rend à l'écran et en JSON-LD depuis la même liste.
 */
export type PageWebJsonLd = {
  '@context': Contexte
  '@type': 'WebPage'
  '@id': string
  url: string
  name: string
  description: string
  inLanguage: string
  isPartOf: Reference
  breadcrumb?: Reference
  about?: Reference
  datePublished?: string
  dateModified?: string
}

/**
 * `sansFil` : l'accueil n'a pas de fil d'Ariane (il en est la racine) ; y
 * désigner `#fil-ariane` pointerait vers un nœud qui n'existe pas.
 */
export function pageWebJsonLd(
  chemin: string,
  opts: { surLeService?: boolean; sansFil?: boolean } = {},
): PageWebJsonLd {
  const route = getRoute(chemin)
  const url = absoluteUrl(route.path)
  return {
    '@context': CONTEXTE,
    '@type': 'WebPage',
    '@id': `${url}#page`,
    url,
    name: route.titreAbsolu ?? route.title,
    description: route.description,
    inLanguage: LANGUE_BALISEE,
    isPartOf: { '@id': SITE_ID },
    ...(opts.sansFil ? {} : { breadcrumb: { '@id': `${url}#fil-ariane` } }),
    ...(opts.surLeService ? { about: { '@id': SERVICE_ID } } : {}),
    ...(route.datePublished ? { datePublished: route.datePublished } : {}),
    ...(route.lastModified ? { dateModified: route.lastModified } : {}),
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
// HowTo — le déroulé d'une réservation, miroir des étapes VISIBLES
// ---------------------------------------------------------------------------

export type EtapeVisible = { readonly titre: string; readonly texte: string }

export type DerouleJsonLd = {
  '@context': Contexte
  '@type': 'HowTo'
  name: string
  inLanguage: string
  step: Array<{ '@type': 'HowToStep'; position: number; name: string; text: string }>
}

/**
 * Google a retiré le résultat enrichi « HowTo » en 2023 ; le TYPE, lui, reste
 * du schema.org valide, et il décrit exactement ce que la page montre : quatre
 * étapes numérotées. Les moteurs de réponse qui lisent le balisage (Bing,
 * Perplexity) y trouvent la séquence sans avoir à la reconstituer depuis la
 * mise en page. Comme la FAQ, il ne se construit QUE depuis la liste affichée :
 * la page passe la même constante à l'écran et à cette fonction.
 */
export function derouleJsonLd(nom: string, etapes: readonly EtapeVisible[]): DerouleJsonLd {
  if (etapes.length === 0) throw new Error('[seo/jsonld] Déroulé vide : rien à baliser.')
  return {
    '@context': CONTEXTE,
    '@type': 'HowTo',
    name: nom,
    inLanguage: LANGUE_BALISEE,
    step: etapes.map((e, i) => ({ '@type': 'HowToStep', position: i + 1, name: e.titre, text: e.texte })),
  }
}

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

export type ElementFilAriane = { name: string; path: string }

export type FilArianeJsonLd = {
  '@context': Contexte
  '@type': 'BreadcrumbList'
  /** `<url de la page>#fil-ariane` — la page est le dernier maillon. */
  '@id': string
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
  const page = items[items.length - 1] as ElementFilAriane
  return {
    '@context': CONTEXTE,
    '@type': 'BreadcrumbList',
    '@id': `${absoluteUrl(page.path)}#fil-ariane`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

// ---------------------------------------------------------------------------
// Ce qu'on n'écrit PAS, et pourquoi
// ---------------------------------------------------------------------------

/*
 * Ce bloc annonçait jusqu'au 02/10/2026 que `SportsActivityLocation` et
 * `FAQPage` restaient « à écrire ». Les deux sont en service (`lieuJsonLd`,
 * `faqJsonLd`) ; un commentaire qui décrit un état périmé envoie le lecteur
 * suivant réparer ce qui marche.
 *
 * Ce qui reste VOLONTAIREMENT absent des lieux, faute de fait vérifié :
 *
 *   geo                        // coordonnées : non relevées sur une source
 *   openingHoursSpecification  // horaires d'ouverture des clubs : non vérifiés.
 *                              // Les heures de RÉSERVATION (lun-sam, 10 h-19 h)
 *                              // ne sont pas les heures d'ouverture du club :
 *                              // les écrire ici ferait dire « fermé à 19 h »
 *                              // à un moteur, ce qui est faux.
 *   image                      // photo dont les droits sont confirmés
 *
 * `aggregateRating`, `review`, `ratingValue`, `reviewCount` — JAMAIS, même sur
 * demande. Ce sont des chiffres fabriqués, pas mesurés, et c'est la catégorie de
 * balisage que Google sanctionne. `scripts/check-seo.mjs` refuse ces clés.
 */
