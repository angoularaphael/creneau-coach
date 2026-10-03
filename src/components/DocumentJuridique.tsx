import Link from 'next/link'

import { analyser, type Bloc, type Segment } from '@/lib/documents/blocs'
import {
  PAGES,
  TITRES,
  TYPES_OBLIGATOIRES,
  cheminPublic,
  documentEtTexte,
  estPublie,
  type TypeDocument,
} from '@/lib/documents/obligatoires'
import { EDITEUR } from '@/lib/seo/verite'

const dateLongue = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function Ligne({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((s, i) => (s.gras ? <strong key={i}>{s.texte}</strong> : <span key={i}>{s.texte}</span>))}
    </>
  )
}

function Sommaire({ articles }: { articles: readonly Bloc[] }) {
  return (
    <ul>
      {articles.map((a) =>
        a.type === 'article' ? (
          <li key={a.ancre}>
            <a href={`#${a.ancre}`}>{a.texte}</a>
          </li>
        ) : null,
      )}
    </ul>
  )
}

/**
 * UN DOCUMENT À SIGNER, LISIBLE EN PAGE — au téléphone d'abord.
 *
 * Le texte affiché est celui qui a servi à fabriquer le PDF EN VIGUEUR, figé à
 * la publication (`coach_documents.texte`). Jamais une version recalculée : la
 * page et le PDF signé ne peuvent pas dire deux choses différentes. Quand la
 * direction a déposé un PDF à la main, il n'y a pas de texte — la page renvoie
 * au PDF, seule version qui fait foi.
 *
 * Un sommaire en tête : les conditions générales comptent vingt articles, et
 * un coach cherche « annulation » ou « avoir », pas l'article 10.
 */
/** Le titre de la section finale, propre à chaque document (un H2 par page). */
const AVEC: Record<TypeDocument, string> = {
  cgv: 'Avec les conditions générales',
  reglement: 'Avec le règlement intérieur',
  decharge: 'Avec la décharge de responsabilité',
}

export async function DocumentJuridique({ type, visuel }: { type: TypeDocument; visuel: string }) {
  const doc = await documentEtTexte(type)
  const publie = doc !== null && estPublie(doc)
  const blocs = publie && doc.texte ? analyser(doc.texte) : []
  const articles = blocs.filter((b) => b.type === 'article')
  const autres = TYPES_OBLIGATOIRES.filter((t) => t !== type)

  return (
    <>
      <header className="page-hero page-hero--visuel" data-visuel={visuel}>
        <h1>{TITRES[type]}</h1>
        {publie ? (
          <p className="page-hero__sous">
            Version du {doc.version.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')}, en vigueur depuis le{' '}
            <time dateTime={String(doc.published_at ?? '').slice(0, 10)}>
              {doc.published_at ? dateLongue.format(new Date(doc.published_at)) : '—'}
            </time>
            . {EDITEUR.raisonSociale}.
          </p>
        ) : (
          <p className="page-hero__sous">
            Ce document est en cours de publication par Boxing Center.
          </p>
        )}
        {publie ? (
          <p className="juridique__actions">
            <a className="btn btn-ghost" href={cheminPublic(type)} target="_blank" rel="noopener">
              Télécharger le PDF
            </a>
          </p>
        ) : null}
      </header>

      {blocs.length > 0 ? (
        <section className="section juridique">
          <div className="enveloppe juridique__grille">
            {/* Deux sommaires, un seul visible : repliable au téléphone (vingt
                articles dépliés enterreraient le début du texte), colonne
                collante sur grand écran. Celui qui est masqué l'est par
                `display: none`, donc absent pour les lecteurs d'écran aussi. */}
            {articles.length > 3 ? (
              <>
                <details className="juridique__sommaire juridique__sommaire--replie">
                  <summary>Sommaire — {articles.length} parties</summary>
                  <Sommaire articles={articles} />
                </details>
                <nav className="juridique__sommaire juridique__sommaire--colonne" aria-label="Sommaire">
                  <p className="juridique__sommaire-titre">Sommaire</p>
                  <Sommaire articles={articles} />
                </nav>
              </>
            ) : null}

            <article className="juridique__texte">
              {blocs.map((b, i) => {
                switch (b.type) {
                  case 'article':
                    return (
                      <h2 key={i} id={b.ancre}>
                        {b.texte}
                      </h2>
                    )
                  case 'sous-titre':
                    return <h3 key={i}>{b.texte}</h3>
                  case 'paragraphe':
                    return (
                      <p key={i}>
                        <Ligne segments={b.segments} />
                      </p>
                    )
                  case 'liste':
                    return (
                      <ul key={i}>
                        {b.elements.map((e, j) => (
                          <li key={j}>
                            <Ligne segments={e} />
                          </li>
                        ))}
                      </ul>
                    )
                }
              })}
            </article>
          </div>
        </section>
      ) : publie ? (
        <section className="section">
          <div className="enveloppe">
            <p>
              Ce document est publié au format PDF, seule version qui fait foi :{' '}
              <a href={cheminPublic(type)} target="_blank" rel="noopener">
                {TITRES[type]} (PDF)
              </a>
              .
            </p>
          </div>
        </section>
      ) : null}

      <section className="section section--encre" data-polarite="encre">
        <div className="enveloppe">
          <h2>{AVEC[type]} : les deux autres documents signés</h2>
          <ul className="regles">
            {autres.map((t) => (
              <li key={t}>
                <Link href={PAGES[t]}>{TITRES[t]}</Link>
              </li>
            ))}
          </ul>
          <p className="muted">
            Une question sur ces documents : <a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>.
          </p>
        </div>
      </section>
    </>
  )
}
