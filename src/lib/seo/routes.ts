/**
 * La carte de routes publiques — typée, validée, et lue par tout le monde.
 *
 * Les données vivent dans `routes.data.json`. Ce fichier ne fait que deux
 * choses : leur donner un type, et **refuser de démarrer** si elles sont
 * incohérentes. Un socle SEO qui laisse passer une route dupliquée ou une route
 * publique qui écrase une surface privée n'est pas un socle, c'est un piège.
 *
 * Pourquoi le JSON plutôt qu'un tableau TypeScript : `scripts/check-seo.mjs`
 * tourne sans compilation (contre un déploiement, hors du bundle). Avec un
 * tableau TS, la liste serait recopiée dans le script — c'est la duplication que
 * .research/spec-05-seo.md §13.3 assume comme limite. Ici elle n'existe pas.
 *
 * Référence : .research/spec-05-seo.md §6 · docs/SEO-INFORMATION-ARCHITECTURE.md §3.
 */

import donnees from './routes.data.json'
import { absoluteUrl, normaliserChemin } from './site'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteStatus =
  /** Contenu validé : indexable, présent dans le sitemap et la navigation. */
  | 'live'
  /** La route existe et est servie, mais son contenu n'est pas validé :
   *  `noindex`, absente du sitemap. C'est l'état par défaut. */
  | 'draft'

export type PublicRoute = {
  /** Chemin canonique, sans slash final. */
  path: string
  /** Titre court. Le suffixe « · Boxing Center » est ajouté par le gabarit. */
  title: string
  /** Remplace intégralement le titre, suffixe compris. Réservé à l'accueil. */
  titreAbsolu?: string
  description: string
  /** Intention principale — docs/SEO-INFORMATION-ARCHITECTURE.md §3. */
  intent: string
  status: RouteStatus
  /** Présente dans la navigation principale visible. */
  inNav: boolean
  /**
   * Date ISO de dernière modification RÉELLE du contenu, posée à la main ou par
   * le CMS. Volontairement optionnelle : on n'émet pas `new Date()`, voir
   * `sitemap.ts`.
   */
  lastModified?: string
}

export type ClubPage = {
  /** Segment d'URL publique. Porte la ville : c'est du SEO local. */
  slug: string
  /** Identifiant de l'API — CAHIER-API.md §3.2. Ce n'est PAS le slug d'URL. */
  clubId: string
  nom: string
  ville: string
}

// ---------------------------------------------------------------------------
// Lecture et validation des données
// ---------------------------------------------------------------------------

const STATUTS_VALIDES: readonly string[] = ['live', 'draft']

function echoue(message: string): never {
  throw new Error(`[seo/routes] ${message} (source : src/lib/seo/routes.data.json)`)
}

/**
 * Les données arrivent d'un fichier JSON : on les traite comme des données
 * inconnues et on les valide, plutôt que de faire confiance à l'inférence de
 * TypeScript sur un fichier que n'importe qui peut éditer à la main.
 */
const brutes = donnees as unknown as {
  prefixesPrives?: unknown
  cheminsAuth?: unknown
  clubs?: unknown
  routes?: unknown
}

/**
 * Préfixes de surfaces jamais indexables. Ils doivent rester alignés sur
 * `src/proxy.ts` (`SURFACES_PRIVEES`) et sur les en-têtes `X-Robots-Tag` de
 * `next.config.ts`. `robots.ts` en dérive ses lignes `Disallow`.
 */
export const PREFIXES_PRIVES: readonly string[] = (() => {
  const brut = brutes.prefixesPrives
  if (!Array.isArray(brut) || brut.length === 0) echoue('« prefixesPrives » vide ou absent')
  return brut.map((p: unknown): string => {
    if (typeof p !== 'string' || !p.startsWith('/') || p.endsWith('/')) {
      echoue(`préfixe privé invalide : ${JSON.stringify(p)} (attendu « /segment »)`)
    }
    return p
  })
})()

/**
 * Pages d'authentification. Servies publiquement, jamais indexables, jamais dans
 * le sitemap. Elles ne sont pas dans `PREFIXES_PRIVES` parce qu'elles n'ont pas
 * de segment propre : `src/proxy.ts` redirige vers `/connexion` à la racine.
 */
export const CHEMINS_AUTH: readonly string[] = (() => {
  const brut = brutes.cheminsAuth
  if (!Array.isArray(brut)) echoue('« cheminsAuth » absent')
  return brut.map((p: unknown): string => {
    if (typeof p !== 'string' || !p.startsWith('/') || (p !== '/' && p.endsWith('/'))) {
      echoue(`chemin d'authentification invalide : ${JSON.stringify(p)}`)
    }
    return p
  })
})()

/** Vrai si le chemin appartient à une surface privée ou d'authentification. */
export function estCheminPrive(chemin: string): boolean {
  const c = normaliserChemin(chemin)
  return (
    PREFIXES_PRIVES.some((p) => c === p || c.startsWith(`${p}/`)) ||
    CHEMINS_AUTH.some((p) => c === p || c.startsWith(`${p}/`))
  )
}

export const CLUB_PAGES: readonly ClubPage[] = (() => {
  const brut = brutes.clubs
  if (!Array.isArray(brut) || brut.length === 0) echoue('« clubs » vide ou absent')

  const slugs = new Set<string>()
  const ids = new Set<string>()

  return brut.map((c: unknown, i: number): ClubPage => {
    const { slug, clubId, nom, ville } = (c ?? {}) as Partial<ClubPage>
    if (!slug || !clubId || !nom || !ville) echoue(`club ${i} : champ manquant`)
    if (!/^[a-z0-9-]+$/.test(slug)) echoue(`slug de club invalide : ${slug}`)
    if (slugs.has(slug)) echoue(`slug de club dupliqué : ${slug}`)
    if (ids.has(clubId)) echoue(`clubId dupliqué : ${clubId}`)
    slugs.add(slug)
    ids.add(clubId)
    return { slug, clubId, nom, ville }
  })
})()

export function getClubBySlug(slug: string): ClubPage | undefined {
  return CLUB_PAGES.find((c) => c.slug === slug)
}

export function getClubByApiId(clubId: string): ClubPage | undefined {
  return CLUB_PAGES.find((c) => c.clubId === clubId)
}

/** Chemin public canonique d'une page club. */
export function cheminClub(slug: string): string {
  return `/clubs/${slug}`
}

/**
 * LA carte. Sitemap, navigation, fil d'Ariane et audit lisent ceci.
 *
 * Les garde-fous sont exécutés à l'import : une carte fausse fait échouer le
 * rendu tout de suite, au lieu de publier un sitemap qui expose une route privée.
 */
export const ALL_PUBLIC_ROUTES: readonly PublicRoute[] = (() => {
  const brut = brutes.routes
  if (!Array.isArray(brut) || brut.length === 0) echoue('« routes » vide ou absent')

  const vues = new Set<string>()
  const titres = new Map<string, string>()
  const descriptions = new Map<string, string>()

  const routes = brut.map((r: unknown, i: number): PublicRoute => {
    const brutRoute = (r ?? {}) as Partial<PublicRoute>
    const { path, title, description, intent, status, inNav } = brutRoute

    if (typeof path !== 'string' || !path.startsWith('/')) {
      echoue(`route ${i} : « path » absent ou ne commençant pas par « / »`)
    }
    if (path !== '/' && path.endsWith('/')) {
      echoue(`route ${path} : slash final interdit dans la carte (voir site.ts, TRAILING_SLASH)`)
    }
    if (!title) echoue(`route ${path} : « title » absent`)
    if (!description) echoue(`route ${path} : « description » absente`)
    if (!intent) echoue(`route ${path} : « intent » absent`)
    if (typeof status !== 'string' || !STATUTS_VALIDES.includes(status)) {
      echoue(`route ${path} : « status » invalide (attendu « live » ou « draft »)`)
    }
    if (typeof inNav !== 'boolean') echoue(`route ${path} : « inNav » doit être un booléen`)

    // Une route publique ne doit JAMAIS entrer en collision avec une surface
    // privée : ce serait une page indexable posée sur l'espace coach.
    if (estCheminPrive(path)) {
      echoue(`route publique interdite : ${path} recouvre une surface privée`)
    }

    if (vues.has(path)) echoue(`route dupliquée : ${path}`)
    vues.add(path)

    // « aucune page club n'est dupliquée ou générique » — §14 du document SEO.
    const dejaTitre = titres.get(title)
    if (dejaTitre) echoue(`titre identique sur ${dejaTitre} et ${path} : « ${title} »`)
    titres.set(title, path)

    const dejaDesc = descriptions.get(description)
    if (dejaDesc) echoue(`description identique sur ${dejaDesc} et ${path}`)
    descriptions.set(description, path)

    return {
      path,
      title,
      ...(brutRoute.titreAbsolu ? { titreAbsolu: brutRoute.titreAbsolu } : {}),
      description,
      intent,
      status: status as RouteStatus,
      inNav,
      ...(brutRoute.lastModified ? { lastModified: brutRoute.lastModified } : {}),
    }
  })

  // Chaque club déclaré doit avoir sa page, et réciproquement : une page club
  // sans club, c'est une URL qui renverra 404 depuis le sitemap.
  for (const club of CLUB_PAGES) {
    if (!vues.has(cheminClub(club.slug))) {
      echoue(`le club « ${club.clubId} » n'a pas de route ${cheminClub(club.slug)}`)
    }
  }
  for (const route of routes) {
    if (route.path.startsWith('/clubs/') && !getClubBySlug(route.path.slice('/clubs/'.length))) {
      echoue(`la route ${route.path} ne correspond à aucun club de « clubs »`)
    }
  }

  return routes
})()

// ---------------------------------------------------------------------------
// Vues dérivées
// ---------------------------------------------------------------------------

/**
 * Récupère une route. Échoue fort et explicitement : une page publique absente
 * de la carte ne serait ni dans le sitemap, ni dans la navigation, ni auditée.
 */
export function getRoute(path: string): PublicRoute {
  const cible = normaliserChemin(path)
  const route = ALL_PUBLIC_ROUTES.find((r) => r.path === cible)
  if (!route) {
    throw new Error(
      `[seo/routes] Route « ${cible} » absente de la carte. Une page publique qui ` +
        "n'y figure pas ne sera ni dans le sitemap, ni dans la navigation, ni " +
        'auditée. Ajoutez-la à src/lib/seo/routes.data.json.',
    )
  }
  return route
}

/** Vrai si la route existe dans la carte. À préférer à un try/catch. */
export function routeExiste(path: string): boolean {
  const cible = normaliserChemin(path)
  return ALL_PUBLIC_ROUTES.some((r) => r.path === cible)
}

/** Routes réellement proposées à l'indexation (contenu validé). */
export const INDEXABLE_ROUTES: readonly PublicRoute[] = ALL_PUBLIC_ROUTES.filter(
  (r) => r.status === 'live',
)

/** Routes de la navigation principale visible, dans l'ordre de la carte. */
export const NAV_ROUTES: readonly PublicRoute[] = ALL_PUBLIC_ROUTES.filter((r) => r.inNav)

/** URLs canoniques absolues des seules routes indexables. */
export const CANONICAL_URLS: readonly string[] = INDEXABLE_ROUTES.map((r) => absoluteUrl(r.path))
