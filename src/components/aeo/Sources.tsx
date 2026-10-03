import Link from 'next/link'

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
 * ── DEUX SORTES DE SOURCES ─────────────────────────────────────────────
 *
 * Une source extérieure (Légifrance, la page officielle d'un club) s'ouvre dans
 * un nouvel onglet. Une source interne — l'article des conditions générales qui
 * fonde une règle, `/conditions-generales#article-10` — reste dans le site, par
 * `Link` : c'est notre propre contrat, le coach doit pouvoir y aller et revenir.
 *
 * ── UN TITRE PAR PAGE ──────────────────────────────────────────────────
 *
 * Le titre était « Sources » partout : le même H2 sur dix pages, ce que le
 * contrôle « aucun H2 dupliqué entre pages » (skill `aeo-geo` §6) refuse. Un
 * H2 qui dit DE QUOI la page apporte la preuve se lit aussi mieux : « Les
 * sources des tarifs » annonce ce qu'on va vérifier. Le défaut reste
 * « Sources » pour les pages qui ne le passent pas encore.
 *
 * Doublons retirés par URL : la même source citée pour trois faits ne
 * s'affiche qu'une fois.
 */
export function Sources({
  items,
  verifieLe,
  titre = 'Sources',
}: {
  items: readonly Source[]
  verifieLe: string
  titre?: string
}) {
  const uniques = [...new Map(items.map((s) => [s.url, s])).values()]
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(verifieLe))

  return (
    <aside className="sources" aria-labelledby="sources-titre">
      <div className="enveloppe">
        <h2 id="sources-titre" className="sources__titre">
          {titre}
        </h2>
        <p className="sources__note">
          Chaque fait de cette page est vérifiable. Dernière vérification le{' '}
          <time dateTime={verifieLe}>{date}</time>.
        </p>
        <ol className="sources__liste">
          {uniques.map((s) => (
            <li key={s.url}>
              {s.url.startsWith('/') ? (
                <Link href={s.url}>{s.libelle}</Link>
              ) : (
                <a href={s.url} rel="noopener" target="_blank">
                  {s.libelle}
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}
