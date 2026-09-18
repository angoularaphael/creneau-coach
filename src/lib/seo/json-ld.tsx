/**
 * Rendu du JSON-LD. Server Component — pas de `'use client'`, et pas de
 * `next/script`.
 *
 * La doc Next est explicite sur les deux points : « Our current recommendation
 * for JSON-LD is to render structured data as a `<script>` tag », et « The
 * `next/script` component is optimized for loading and executing JavaScript.
 * Since JSON-LD is structured data, not executable code, a native `<script>` tag
 * is the right choice here. »
 *
 * L'échappement du `<` en `<` est la protection XSS recommandée par cette
 * même page : `JSON.stringify` ne nettoie pas les chaînes hostiles, et une
 * chaîne contenant `</script>` couperait la balise.
 *
 * Le type `NoeudJsonLd` n'est pas `object` : c'est l'union fermée des nœuds de
 * `jsonld.ts`. Un objet fabriqué à la main, avec une adresse inventée, ne passe
 * pas la compilation. C'est la règle D5 rendue mécanique.
 *
 * Référence : .research/spec-05-seo.md §11.1 et §11.4.
 */

import type {
  FilArianeJsonLd,
  OrganisationJsonLd,
  ServiceJsonLd,
  SiteWebJsonLd,
} from './jsonld'

export type NoeudJsonLd =
  | OrganisationJsonLd
  | SiteWebJsonLd
  | ServiceJsonLd
  | FilArianeJsonLd

export function JsonLd({ data }: { data: NoeudJsonLd | readonly NoeudJsonLd[] }) {
  const noeuds: readonly NoeudJsonLd[] = Array.isArray(data)
    ? (data as readonly NoeudJsonLd[])
    : [data as NoeudJsonLd]

  const premier = noeuds[0]
  if (premier === undefined) return null

  // Un seul nœud sort en objet, plusieurs sortent en tableau : c'est la forme
  // que les validateurs de données structurées attendent dans les deux cas.
  const charge: unknown = noeuds.length === 1 ? premier : noeuds

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(charge).replace(/</g, '\\u003c'),
      }}
    />
  )
}
