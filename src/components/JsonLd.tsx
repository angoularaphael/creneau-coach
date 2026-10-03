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
 * Ce que CE composant pose, sur toutes les pages via le layout : l'entité
 * Boxing Center (`Organization`) et le site (`WebSite`), rien d'autre. Les
 * nœuds propres à une page — le lieu d'un club (`SportsActivityLocation`, avec
 * l'adresse VÉRIFIÉE du registre `src/lib/seo/verite.ts`), le service et ses
 * prix, la page datée (`WebPage`), la FAQ, le fil d'Ariane — sont posés par la
 * page elle-même, depuis `@/lib/seo/jsonld`.
 *
 * Ce commentaire disait jusqu'au 02/10/2026 « aucune adresse, aucun
 * LocalBusiness » : c'était vrai avant que le registre ne vérifie les cinq
 * adresses (27/09/2026). Ce qui reste interdit, faute de fait vérifié :
 * horaires d'ouverture, coordonnées, notes, avis (voir le bas de `jsonld.ts`).
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
