/**
 * Le seul fichier du projet qui connaît le domaine.
 *
 * Aucun autre fichier ne doit lire `NEXT_PUBLIC_SITE_URL`, ni écrire une URL
 * absolue en dur. Tout passe par `absoluteUrl()`.
 *
 * Deux mécanismes de sûreté, et ils sont volontairement désagréables :
 *   1. le build de production **échoue** si le domaine n'est pas fourni ;
 *   2. rien n'est indexable tant qu'un humain n'a pas basculé `IS_INDEXABLE`.
 *
 * Référence : .research/spec-05-seo.md §5, §15.1 ·
 * docs/SEO-INFORMATION-ARCHITECTURE.md §8.
 */

// ---------------------------------------------------------------------------
// Forme des URLs
// ---------------------------------------------------------------------------

/**
 * Forme des URLs du site. `false` = pas de slash final, ce qui est le défaut de
 * Next (`/tarifs/` redirige vers `/tarifs`).
 *
 * DOIT rester synchronisé avec `trailingSlash` dans `next.config.ts`. Basculer
 * demande **deux** lignes, jamais une seule :
 *   - ici : `TRAILING_SLASH = true`
 *   - `next.config.ts` : `trailingSlash: true`
 *
 * Un canonical avec slash sur une URL servie sans slash est un canonical
 * mensonger, et une redirection de plus payée par le crawler.
 */
export const TRAILING_SLASH = false

/**
 * Chemins qui ne prennent JAMAIS de slash final, même si `TRAILING_SLASH` passe
 * à `true`. Les fichiers (avec extension) sont détectés automatiquement ; ces
 * routes-là sont des conventions de metadata Next sans extension, donc
 * indétectables autrement.
 */
const CHEMINS_SANS_SLASH_FINAL = [
  '/opengraph-image',
  '/twitter-image',
  '/icon',
  '/apple-icon',
]

// ---------------------------------------------------------------------------
// Identité
// ---------------------------------------------------------------------------

export const SITE_NAME = 'Boxing Center'

/**
 * Séparateur du gabarit de titre.
 *
 * ATTENTION — cette valeur DOIT reproduire `metadata.title.template` de
 * `src/app/layout.tsx` (aujourd'hui : `'%s · Boxing Center'`).
 *
 * Elle ne sert pas à produire le `<title>` : c'est Next qui l'assemble depuis le
 * gabarit du layout. Elle sert à produire `og:title` et `twitter:title`, qui
 * doivent afficher exactement le même texte. Une divergence ici publie un titre
 * de partage différent du titre de la page, sans erreur et sans bruit.
 *
 * `scripts/check-seo.mjs` compare les deux fichiers et échoue si elles divergent.
 */
export const SEPARATEUR_TITRE = ' · '

/** Suffixe complet ajouté aux titres courts. */
export const TITLE_SUFFIX = `${SEPARATEUR_TITRE}${SITE_NAME}`

export const LOCALE = 'fr_FR'
export const LANG = 'fr'
export const LANGUE_BALISEE = 'fr-FR'

/** Repli de développement. Aligné sur `npm run dev` (`next dev -p 3041`). */
export const URL_DEV_PAR_DEFAUT = 'http://localhost:3041'

// ---------------------------------------------------------------------------
// Résolution du domaine
// ---------------------------------------------------------------------------

function resoudreUrlSite(): string {
  const explicite = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicite) return explicite.replace(/\/+$/, '')

  // Prévisualisation Vercel : le domaine change à chaque déploiement. On
  // l'accepte pour que les liens de preview fonctionnent, mais `IS_INDEXABLE`
  // reste faux (voir plus bas), donc aucun canonical de preview n'est jamais
  // proposé à l'indexation.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL est manquant. Build interrompu volontairement : un ' +
        "canonical faux est pire que pas de canonical du tout — il demande à Google " +
        'de consolider tout le site vers une URL morte, et ça se répare en semaines, ' +
        'pas en un redéploiement. Voir .research/spec-05-seo.md §2.4 et §15.1.',
    )
  }

  return URL_DEV_PAR_DEFAUT
}

/** Origine du site, sans slash final. */
export const SITE_URL = resoudreUrlSite()

// ---------------------------------------------------------------------------
// L'interrupteur d'indexation — un seul, ici
// ---------------------------------------------------------------------------

/**
 * Faux par défaut, y compris en production. Le passer à vrai est une décision
 * de la direction, pas un effet de bord d'un déploiement
 * (docs/SEO-INFORMATION-ARCHITECTURE.md §8).
 *
 * Quand il vaut `false` :
 *   - `robots.txt` interdit tout le site ;
 *   - le sitemap est vide ;
 *   - `buildMetadata()` sort `noindex, nofollow` sur toutes les pages.
 *
 * Ordre d'ouverture, dans cet ordre et pas un autre :
 *   1. `NEXT_PUBLIC_SITE_URL=https://<domaine réellement servi>` ;
 *   2. `node scripts/check-seo.mjs https://<domaine> --strict` → vert ;
 *   3. `NEXT_PUBLIC_SEO_INDEXABLE=true`.
 */
export const IS_INDEXABLE =
  process.env.NEXT_PUBLIC_SEO_INDEXABLE === 'true' &&
  // Ceinture : on refuse d'indexer un domaine de prévisualisation même si
  // quelqu'un met l'interrupteur à `true` dans les variables de preview.
  process.env.VERCEL_ENV !== 'preview'

// ---------------------------------------------------------------------------
// Fabrication d'URL
// ---------------------------------------------------------------------------

/**
 * Unique fabricant d'URL absolue du projet.
 *
 * - laisse passer une URL déjà absolue ;
 * - n'ajoute jamais de slash final à un fichier (`/sitemap.xml`, `/images/x.png`)
 *   ni à une route de metadata listée dans `CHEMINS_SANS_SLASH_FINAL` ;
 * - respecte `TRAILING_SLASH` pour tout le reste.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path

  let p = path.startsWith('/') ? path : `/${path}`

  if (p !== '/') {
    p = p.replace(/\/+$/, '')

    const dernierSegment = p.slice(p.lastIndexOf('/') + 1)
    const estFichier = dernierSegment.includes('.')
    const estRouteDeMetadata = CHEMINS_SANS_SLASH_FINAL.some(
      (exception) => p === exception || p.startsWith(`${exception}/`),
    )

    if (TRAILING_SLASH && !estFichier && !estRouteDeMetadata) p = `${p}/`
  }

  return `${SITE_URL}${p}`
}

/**
 * Normalise un chemin servi (tel que reçu par HTTP) vers la forme utilisée par
 * la carte de routes : sans slash final, `/` pour la racine. Utilisé par les
 * comparaisons de l'audit et par le fil d'Ariane.
 */
export function normaliserChemin(chemin: string): string {
  const sansParametres = chemin.split(/[?#]/)[0] ?? chemin
  const sansSlash = sansParametres.replace(/\/+$/, '')
  return sansSlash === '' ? '/' : sansSlash
}
