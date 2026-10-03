import Link from 'next/link'

import type { Regle } from '@/lib/seo/verite'

/**
 * L'article qui fonde une règle, juste sous la règle.
 *
 * Le bloc Sources, en bas de page, prouve l'ensemble ; cette ligne prouve LA
 * phrase qu'on vient de lire, là où le coach se pose la question. Elle donne
 * aussi au moteur de réponse une attribution collée au fait (« selon l'article
 * 10 des conditions générales ») — la forme que la mesure de Princeton
 * récompense le plus (+41 % pour une citation attribuée).
 */
export function Fondement({ regle }: { regle: Regle }) {
  const { url, libelle } = regle.source
  return (
    <p className="regle-source">
      Ce que dit le contrat :{' '}
      {url.startsWith('/') ? (
        <Link href={url}>{libelle}</Link>
      ) : (
        <a href={url} rel="noopener" target="_blank">
          {libelle}
        </a>
      )}
    </p>
  )
}
