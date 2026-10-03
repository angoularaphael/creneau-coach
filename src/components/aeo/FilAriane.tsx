import Link from 'next/link'

import { JsonLd } from '@/lib/seo/json-ld'
import { breadcrumbJsonLd, type ElementFilAriane } from '@/lib/seo/jsonld'

/**
 * LE FIL D'ARIANE — visible et balisé depuis la MÊME liste, comme la FAQ.
 *
 * Les pages l'écrivaient à la main (`<Link href="/">Accueil</Link> / …`) et,
 * plus bas, repassaient une autre liste à `breadcrumbJsonLd`. Deux listes, donc
 * un jour deux fils différents ; et `/comment-ca-marche` n'en avait aucun des
 * deux. `docs/SEO-INFORMATION-ARCHITECTURE.md` §7 : le balisage doit refléter
 * le fil VISIBLE, sinon il est ignoré.
 *
 * Rendu dans la petite capitale du surtitre (`.sur.mono`), à l'endroit où il
 * était : rien ne bouge à l'écran. `nav` + `aria-current` le rendent lisible
 * comme un fil d'Ariane par un lecteur d'écran, ce que n'était pas un `<p>`.
 */
export function FilAriane({ items }: { items: readonly ElementFilAriane[] }) {
  return (
    <>
      <nav className="sur mono" aria-label="Fil d’Ariane">
        {items.map((item, i) => {
          const dernier = i === items.length - 1
          return (
            <span key={item.path}>
              {i > 0 ? ' / ' : null}
              {dernier ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <Link href={item.path}>{item.name}</Link>
              )}
            </span>
          )
        })}
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  )
}
