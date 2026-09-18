/**
 * Données structurées JSON-LD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RÈGLE D5 — RIEN QUI NE SOIT VRAI                                         │
 * │                                                                          │
 * │ Ce projet n'a AUCUNE adresse de club confirmée, AUCUN horaire confirmé,  │
 * │ AUCUN avis. `.research/decisions.md` D5 et                               │
 * │ `docs/SEO-INFORMATION-ARCHITECTURE.md` §6 et §9 l'écrivent noir sur      │
 * │ blanc. Ce fichier ne livre donc que le balisage qui reste VRAI sans ces  │
 * │ données.                                                                 │
 * │                                                                          │
 * │ Le garde-fou n'est pas un commentaire : les types ci-dessous n'ont PAS   │
 * │ de champ `address`, `telephone`, `openingHours`, `geo`, `aggregateRating`│
 * │ ni `review`. Les ajouter est une erreur de compilation, pas un oubli.    │
 * │ `scripts/check-seo.mjs` refait le contrôle sur le HTML servi.            │
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
export type ServiceJsonLd = {
  '@context': Contexte
  '@type': 'Service'
  name: string
  serviceType: string
  provider: Reference
  url: string
  areaServed: { '@type': 'AdministrativeArea'; name: string }
}

export function serviceJsonLd(): ServiceJsonLd {
  return {
    '@context': CONTEXTE,
    '@type': 'Service',
    name: 'Location de créneaux pour coachs indépendants',
    serviceType: 'Location d’espace de coaching sportif',
    provider: { '@id': ORG_ID },
    url: absoluteUrl('/'),
    areaServed: { '@type': 'AdministrativeArea', name: 'Toulouse et agglomération' },
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
