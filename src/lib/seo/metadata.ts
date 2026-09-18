/**
 * Le SEUL fabricant de `metadata` de page du projet.
 *
 * Personne n'écrit `openGraph`, `alternates`, `twitter` ou `robots` à la main.
 * Raison, et elle n'est pas cosmétique : la fusion des metadata de Next est
 * **superficielle**. Une page qui déclare `openGraph: { title }` efface le
 * `siteName`, le `locale` et l'image posés par le layout — sans erreur, sans
 * avertissement, et sans que ça se voie autrement qu'en lisant le HTML servi.
 *
 * `buildMetadata()` reconstruit donc le bloc entier à chaque appel.
 *
 * Référence : .research/spec-05-seo.md §9.
 */

import type { Metadata } from 'next'

import { getRoute } from './routes'
import { IS_INDEXABLE, LOCALE, SITE_NAME, TITLE_SUFFIX, absoluteUrl } from './site'

// ---------------------------------------------------------------------------
// Valeurs de `robots`
// ---------------------------------------------------------------------------

const ROBOTS_NOINDEX = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
} as const satisfies NonNullable<Metadata['robots']>

const ROBOTS_INDEX = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
} as const satisfies NonNullable<Metadata['robots']>

/**
 * Valeur de `robots` à poser dans le layout racine.
 *
 * `src/app/layout.tsx` écrit aujourd'hui `robots: { index: false, follow: false }`
 * en dur. Tant que c'est le cas, l'interrupteur `NEXT_PUBLIC_SEO_INDEXABLE` ne
 * gouverne pas la racine, et la bascule d'indexation demande deux gestes au lieu
 * d'un. Le remplacement est d'une ligne :
 *
 * ```ts
 * import { ROBOTS_RACINE } from '@/lib/seo'
 * export const metadata: Metadata = { …, robots: ROBOTS_RACINE }
 * ```
 *
 * `scripts/check-seo.mjs` signale tant que ce n'est pas fait.
 */
export const ROBOTS_RACINE: Metadata['robots'] = IS_INDEXABLE ? ROBOTS_INDEX : ROBOTS_NOINDEX

// ---------------------------------------------------------------------------
// Image Open Graph
// ---------------------------------------------------------------------------

export type OgImage = {
  /** Chemin ou URL. Passé par `absoluteUrl()`. */
  url: string
  alt: string
  width: number
  height: number
}

/**
 * Image Open Graph par défaut — **absente aujourd'hui, et c'est volontaire**.
 *
 * Aucun fichier 1200×630 n'existe dans `public/` : les cinq photos de club sont
 * en 3:2 ou en portrait, et `logo.png` fait 186×88, sous le minimum de 200×200
 * des réseaux. Déclarer une `og:image` qui pointe vers un fichier absent ou mal
 * proportionné est pire que ne rien déclarer : le partage affiche un cadre vide
 * ou une image tronquée.
 *
 * POUR L'ACTIVER — un seul geste, dans cet ordre :
 *   1. créer `src/app/opengraph-image.tsx` (le code est dans
 *      .research/spec-05-seo.md §12.3 : `ImageResponse`, 1200×630, flexbox
 *      uniquement, pas de police woff2) ;
 *   2. remplacer la ligne ci-dessous par :
 *      `export const OG_IMAGE_PAR_DEFAUT: OgImage | null = {
 *         url: '/opengraph-image', alt: '…', width: 1200, height: 630 }`
 *
 * Rien d'autre à changer : `buildMetadata()` s'en sert automatiquement.
 */
export const OG_IMAGE_PAR_DEFAUT: OgImage | null = null

// ---------------------------------------------------------------------------
// buildMetadata
// ---------------------------------------------------------------------------

export type BuildMetadataInput = {
  /** Titre court. Le suffixe « · Boxing Center » est ajouté par le gabarit. */
  title: string
  /** Remplace intégralement le titre, suffixe compris. Réservé à l'accueil. */
  titreAbsolu?: string
  description: string
  /** Chemin canonique, par ex. `/clubs/toulouse-minimes`. */
  path: string
  image?: OgImage | null
  /**
   * Force le `noindex` quelle que soit la valeur globale. À passer pour toute
   * route dont le contenu n'est pas validé : `noindex: route.status !== 'live'`.
   */
  noindex?: boolean
  type?: 'website' | 'article'
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const canonical = absoluteUrl(input.path)
  const titreComplet = input.titreAbsolu ?? `${input.title}${TITLE_SUFFIX}`
  const indexable = IS_INDEXABLE && !input.noindex

  const image = input.image === undefined ? OG_IMAGE_PAR_DEFAUT : input.image
  const images = image
    ? [
        {
          url: absoluteUrl(image.url),
          width: image.width,
          height: image.height,
          alt: image.alt,
        },
      ]
    : undefined

  return {
    title: input.titreAbsolu ? { absolute: input.titreAbsolu } : input.title,
    description: input.description,

    // Le canonical n'est posé QUE par cette fonction, et jamais dans le layout
    // racine : un `alternates` hérité ferait déclarer à chaque page qu'elle est
    // la page d'accueil. Voir .research/spec-05-seo.md §9.1 A.
    alternates: { canonical },

    openGraph: {
      type: input.type ?? 'website',
      siteName: SITE_NAME,
      locale: LOCALE,
      url: canonical,
      title: titreComplet,
      description: input.description,
      ...(images ? { images } : {}),
    },

    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: titreComplet,
      description: input.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },

    robots: indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX,
  }
}

/**
 * La forme que 99 % des pages doivent utiliser : une ligne, et tout est juste.
 *
 * ```tsx
 * // src/app/(public)/tarifs/page.tsx
 * export const metadata = metadataDeRoute('/tarifs')
 * ```
 *
 * Le titre, la description, le canonical et le `noindex` des pages non validées
 * viennent de `routes.data.json`. Une page absente de la carte échoue au rendu,
 * bruyamment, plutôt que de sortir sans canonical dans le silence.
 *
 * `surcharge` sert aux rares cas légitimes : une image OG propre à la page, un
 * `type: 'article'`. Jamais un canonical écrit à la main.
 */
export function metadataDeRoute(
  path: string,
  surcharge?: Pick<BuildMetadataInput, 'image' | 'type'>,
): Metadata {
  const route = getRoute(path)
  return buildMetadata({
    title: route.title,
    ...(route.titreAbsolu ? { titreAbsolu: route.titreAbsolu } : {}),
    description: route.description,
    path: route.path,
    noindex: route.status !== 'live',
    ...surcharge,
  })
}
