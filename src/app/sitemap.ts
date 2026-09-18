import type { MetadataRoute } from 'next'

import { INDEXABLE_ROUTES } from '@/lib/seo/routes'
import { IS_INDEXABLE, absoluteUrl } from '@/lib/seo/site'

/**
 * `/sitemap.xml` — convention de fichier `app/sitemap.ts`.
 *
 * Ne contient QUE les routes dont le contenu est validé (`status: 'live'` dans
 * `lib/seo/routes.data.json`). Aujourd'hui aucune ne l'est : le sitemap est
 * vide, et c'est la bonne réponse. Un sitemap est une liste de pages qu'on juge
 * dignes d'être indexées ; y mettre une page qu'on n'a pas encore écrite, c'est
 * se faire noter sur du contenu qui n'existe pas.
 *
 * ── Trois absences volontaires ─────────────────────────────────────────────
 *
 * `lastModified` n'est émis que si un humain ou le CMS a posé une vraie date.
 * Le réflexe `lastModified: new Date()` met la date du build sur toutes les URLs
 * à chaque déploiement, y compris celles qu'on n'a pas touchées. C'est un signal
 * faux, et un `lastmod` faux est un `lastmod` que le crawler apprend à ignorer :
 * on perd l'outil pour de bon le jour où on en a vraiment besoin.
 *
 * `priority` et `changeFrequency` : le type les accepte, ils n'apportent rien
 * ici. Dix-huit URLs, aucune hiérarchie de crawl à arbitrer. Les laisser vides
 * évite d'inventer une importance relative entre `/tarifs` et `/faq` que
 * personne n'a décidée.
 *
 * `alternates.languages` : il n'existe qu'une version française. « Alternates
 * linguistiques seulement si de vraies versions existent »
 * (docs/SEO-INFORMATION-ARCHITECTURE.md §7).
 *
 * `generateSitemaps` n'est pas utilisé : la découpe sert au-delà de 50 000 URLs.
 *
 * Référence : .research/spec-05-seo.md §7.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Tant que la direction n'a pas décidé l'indexation, le sitemap est vide.
  if (!IS_INDEXABLE) return []

  return INDEXABLE_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    ...(route.lastModified ? { lastModified: route.lastModified } : {}),
  }))
}
