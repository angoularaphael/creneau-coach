import type { MetadataRoute } from 'next'

import { CHEMINS_AUTH, PREFIXES_PRIVES } from '@/lib/seo/routes'
import { IS_INDEXABLE, absoluteUrl } from '@/lib/seo/site'

/**
 * `/robots.txt` — convention de fichier `app/robots.ts`.
 *
 * Deux états, un seul interrupteur (`NEXT_PUBLIC_SEO_INDEXABLE`, voir
 * `lib/seo/site.ts`) :
 *
 *   - fermé  : tout le site est interdit, aucun sitemap n'est déclaré ;
 *   - ouvert : le site public est autorisé, les surfaces privées sont exclues.
 *
 * ── Ce qu'il faut savoir avant de toucher à ce fichier ─────────────────────
 *
 * 1. `Disallow` et `noindex` ne s'additionnent pas, ils se gênent. Google :
 *    « If the page is blocked by a robots.txt file […] the crawler will never
 *    see the `noindex` rule, and the page can still appear in search results. »
 *    On assume la stratégie « Disallow » parce que le site n'a aucun historique
 *    d'indexation à nettoyer (docs/SEO-INFORMATION-ARCHITECTURE.md §8). Le jour
 *    où une URL privée apparaît dans Search Console, il faut RETIRER sa ligne
 *    `Disallow` — et seulement celle-là — pour que Google vienne lire le
 *    `noindex` et désindexe pour de bon. Le `noindex` est déjà posé partout, la
 *    bascule coûte une ligne.
 *
 * 2. Ne JAMAIS ajouter `/_next/` aux interdictions. C'est là que vivent le CSS
 *    et le JS compilés : bloqués, Google rend une page sans style, la juge
 *    médiocre, et l'évaluation mobile s'effondre. `scripts/check-seo.mjs`
 *    échoue si cette ligne apparaît.
 *
 * 3. `robots.txt` ne remplace pas l'authentification. Il est public et lisible :
 *    y lister une surface privée la rend découvrable. La vraie protection est
 *    dans `src/proxy.ts`, dans les route handlers et dans la RLS Postgres.
 *
 * Référence : .research/spec-05-seo.md §8.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_INDEXABLE) {
    // Avant la décision d'indexation : rien n'est crawlable, et on ne déclare
    // aucun sitemap. Un sitemap annoncé sur un site interdit est un signal
    // contradictoire de plus.
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Surfaces privées — alignées sur `src/proxy.ts` et sur les en-têtes
          // `X-Robots-Tag` de `next.config.ts`. Source unique : routes.data.json.
          ...PREFIXES_PRIVES.map((prefixe) => `${prefixe}/`),
          // Pages d'authentification : servies publiquement, sans intérêt pour
          // la recherche, et elles n'ont pas de segment propre.
          ...CHEMINS_AUTH,
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    // `host` est une directive Yandex, ignorée par Google. On ne la met pas.
  }
}
