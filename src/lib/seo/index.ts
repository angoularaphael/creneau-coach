/**
 * Point d'entrée du socle SEO. Tout se consomme depuis `@/lib/seo`.
 *
 * Une page publique n'a besoin que de ceci :
 *
 * ```tsx
 * import { metadataDeRoute, JsonLd, breadcrumbJsonLd } from '@/lib/seo'
 *
 * export const metadata = metadataDeRoute('/tarifs')
 * ```
 *
 * Ce qu'il ne faut PAS faire est listé dans `docs/SEO-SOCLE.md` §3.
 */

export {
  IS_INDEXABLE,
  LANG,
  LANGUE_BALISEE,
  LOCALE,
  SEPARATEUR_TITRE,
  SITE_NAME,
  SITE_URL,
  TITLE_SUFFIX,
  TRAILING_SLASH,
  absoluteUrl,
  normaliserChemin,
} from './site'

export {
  ALL_PUBLIC_ROUTES,
  CANONICAL_URLS,
  CHEMINS_AUTH,
  CLUB_PAGES,
  INDEXABLE_ROUTES,
  NAV_ROUTES,
  PREFIXES_PRIVES,
  cheminClub,
  estCheminPrive,
  getClubByApiId,
  getClubBySlug,
  getRoute,
  routeExiste,
} from './routes'
export type { ClubPage, PublicRoute, RouteStatus } from './routes'

export {
  OG_IMAGE_PAR_DEFAUT,
  ROBOTS_RACINE,
  buildMetadata,
  metadataDeRoute,
} from './metadata'
export type { BuildMetadataInput, OgImage } from './metadata'

export {
  ORG_ID,
  SITE_ID,
  breadcrumbJsonLd,
  organizationJsonLd,
  serviceJsonLd,
  webSiteJsonLd,
} from './jsonld'
export type {
  ElementFilAriane,
  FilArianeJsonLd,
  OrganisationJsonLd,
  ServiceJsonLd,
  SiteWebJsonLd,
} from './jsonld'

export { JsonLd } from './json-ld'
export type { NoeudJsonLd } from './json-ld'
