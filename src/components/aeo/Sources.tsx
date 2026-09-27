import type { Source } from '@/lib/seo/verite'

/**
 * LE BLOC SOURCES — la preuve, visible et liée.
 *
 * Mesuré, pas supposé : sur 10 000 requêtes, ajouter des sources citées augmente
 * la visibilité dans les réponses générées de 28 %, et c'est pour les pages mal
 * classées que le gain est le plus fort (Aggarwal et al., « GEO: Generative
 * Engine Optimization », KDD 2024). Un petit site qui débute est exactement
 * dans ce cas.
 *
 * Mais la raison première n'est pas le moteur : c'est le coach. Quand une page
 * affirme qu'enseigner sans diplôme expose à un an de prison, elle doit donner
 * le texte de loi. Une affirmation sans source se lit comme une rumeur.
 *
 * ── LES LIENS SONT SUIVIS ──────────────────────────────────────────────
 *
 * Pas de `rel="nofollow"` : citer une source, c'est la recommander. Mettre
 * `nofollow` sur Légifrance ou l'INJEP reviendrait à dire qu'on ne s'en porte
 * pas garant — l'inverse du but. `noopener` suffit à la sécurité.
 *
 * Doublons retirés par URL : la même source citée pour trois faits ne
 * s'affiche qu'une fois.
 */
export function Sources({ items, verifieLe }: { items: readonly Source[]; verifieLe: string }) {
  const uniques = [...new Map(items.map((s) => [s.url, s])).values()]
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(verifieLe))

  return (
    <aside className="sources" aria-labelledby="sources-titre">
      <div className="enveloppe">
        <h2 id="sources-titre" className="sources__titre">
          Sources
        </h2>
        <p className="sources__note">
          Chaque fait de cette page est vérifiable. Dernière vérification le{' '}
          <time dateTime={verifieLe}>{date}</time>.
        </p>
        <ol className="sources__liste">
          {uniques.map((s) => (
            <li key={s.url}>
              <a href={s.url} rel="noopener" target="_blank">
                {s.libelle}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}
