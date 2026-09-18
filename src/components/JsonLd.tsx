import { organizationJsonLd, webSiteJsonLd, serviceJsonLd } from '@/lib/seo'
import type { ElementFilAriane } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo'

/**
 * Données structurées — un seul `@graph` par page.
 *
 * Même standard que les projets frères (`boutique-de-boxe/site/lib/seo.ts`) :
 * des nœuds composables, assemblés en un graphe unique, et des `@id` stables qui
 * permettent aux nœuds de se référencer entre eux. Un moteur lit alors UNE entité
 * Boxing Center, pas cinq copies qui se contredisent.
 *
 * Ce qu'on ne fera pas, et c'est délibéré (`.research/decisions.md` D5) :
 * aucune adresse, aucun horaire d'ouverture, aucun `LocalBusiness`, aucune note,
 * aucun avis. Aucun de ces faits n'est confirmé pour les cinq clubs. Un
 * `LocalBusiness` avec une adresse inventée est une donnée fausse publiée sous
 * une forme que les moteurs citent mot pour mot — c'est pire que l'absence.
 * `docs/SEO-SOCLE.md` dit exactement où les brancher quand la direction les
 * fournira.
 */
export function JsonLd({
  fil,
  service = false,
}: {
  /** Fil d'Ariane de la page. Omis sur l'accueil, qui est la racine. */
  fil?: ElementFilAriane[]
  /** Pose le nœud `Service` — réservé aux pages qui décrivent l'offre. */
  service?: boolean
}) {
  const noeuds: unknown[] = [organizationJsonLd(), webSiteJsonLd()]
  if (service) noeuds.push(serviceJsonLd())
  if (fil && fil.length > 0) noeuds.push(breadcrumbJsonLd(fil))

  const graphe = { '@context': 'https://schema.org', '@graph': noeuds }

  return (
    <script
      type="application/ld+json"
      // Le contenu vient de nos propres constantes, jamais d'une saisie
      // utilisateur. On échappe tout de même `<` : un `</script>` dans une
      // chaîne fermerait la balise et permettrait une injection.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graphe).replace(/</g, '\\u003c'),
      }}
    />
  )
}
