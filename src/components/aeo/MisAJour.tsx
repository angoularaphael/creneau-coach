import { getRoute } from '@/lib/seo/routes'

/**
 * « Mis à jour le … » — la date VRAIE, lue dans la carte de routes.
 *
 * Elle était écrite en dur dans chaque page (`const MIS_A_JOUR = '2026-09-27'`)
 * et n'avait aucun lien avec le sitemap ni avec le JSON-LD : trois dates qui
 * pouvaient diverger sans bruit. Elle vit désormais une seule fois, dans
 * `routes.data.json` (`lastModified`), et sort ici, dans le `lastmod` du
 * sitemap et dans le `dateModified` du nœud `WebPage`.
 *
 * Ce qui la garde honnête n'est pas ce composant mais `scripts/verifier-aeo.mjs`,
 * qui la compare au dernier commit de la page : une page modifiée sans que sa
 * date suive fait échouer le contrôle. HubSpot (State of AEO 2026) mesure une
 * corrélation entre une date visible et la citation ; la skill `aeo-geo` §6
 * rappelle qu'une date fausse coûte plus qu'une date absente — d'où le choix de
 * ne RIEN afficher quand la carte n'a pas de date, plutôt que la date du build.
 */
export function MisAJour({ chemin }: { chemin: string }) {
  const date = getRoute(chemin).lastModified
  if (!date) return null
  const lisible = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
  return (
    <p className="maj">
      Mis à jour le <time dateTime={date}>{lisible}</time>
    </p>
  )
}
