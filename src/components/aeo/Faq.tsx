import { JsonLd } from '@/lib/seo/json-ld'
import { faqJsonLd, type QuestionReponse } from '@/lib/seo/jsonld'

/**
 * LA FAQ VISIBLE ET SON BALISAGE — depuis UNE SEULE liste.
 *
 * Deux fautes symétriques à éviter, et ce composant les rend impossibles :
 *
 *   · une FAQ balisée en `FAQPage` sans équivalent à l'écran — Google la
 *     considère comme du balisage trompeur ;
 *   · une FAQ affichée sans balisage — elle prive les moteurs de réponse de la
 *     forme qu'ils citent le plus volontiers (HubSpot, State of AEO 2026 :
 *     « FAQ schema showed a strong relationship with citations »).
 *
 * La même constante produit les deux. Impossible d'en ajouter une question à
 * l'écran sans qu'elle entre dans le balisage, et l'inverse.
 *
 * ── POURQUOI `<details>` ────────────────────────────────────────────────
 *
 * Ouverture au clavier, lecture par les lecteurs d'écran, fonctionnement sans
 * JavaScript : le navigateur fait tout. Le contenu replié reste dans le DOM,
 * donc lu par les robots — ce qui compte ici n'est pas qu'il soit déplié, c'est
 * qu'il existe dans la page servie.
 *
 * La PREMIÈRE question est ouverte d'office : une FAQ entièrement repliée
 * ressemble à une liste de titres, et on ne sait pas qu'il y a une réponse
 * derrière tant qu'on n'a pas cliqué.
 */
export function Faq({
  titre = 'Les questions qu’on nous pose',
  items,
}: {
  titre?: string
  items: readonly QuestionReponse[]
}) {
  return (
    <section className="section" aria-labelledby="faq-titre">
      <div className="enveloppe">
        <h2 id="faq-titre">{titre}</h2>
        <Questions items={items} ouvrirLaPremiere />
      </div>
      <JsonLd data={faqJsonLd(items)} />
    </section>
  )
}

export type ThemeFaq = {
  /** Ancre du thème, pour le sommaire de la page. */
  readonly id: string
  /** Le H2 : une affirmation, pas une étiquette (« Payer : carte ou avoir »). */
  readonly titre: string
  readonly items: readonly QuestionReponse[]
}

/**
 * La FAQ d'une page DÉDIÉE (`/faq`) : plusieurs thèmes, chacun son H2, et UN
 * SEUL nœud `FAQPage` pour toute la page.
 *
 * Pourquoi pas plusieurs `<Faq>` empilés : chacun émettrait son propre
 * `FAQPage`, et une page qui déclare six FAQ n'en a, pour Google, aucune de
 * principale. Le balisage reste le miroir exact de l'écran : la liste à plat
 * des mêmes questions, dans le même ordre.
 *
 * Les sections alternent noir et encre, comme le reste du site : une FAQ de
 * vingt questions sur un seul fond se lit comme un mur.
 */
export function FaqParTheme({ themes }: { themes: readonly ThemeFaq[] }) {
  const toutes = themes.flatMap((t) => t.items)
  return (
    <>
      {themes.map((t, i) => (
        <section
          key={t.id}
          id={t.id}
          className={i % 2 === 1 ? 'section section--encre' : 'section'}
          {...(i % 2 === 1 ? { 'data-polarite': 'encre' } : {})}
          aria-labelledby={`${t.id}-titre`}
        >
          <div className="enveloppe">
            <h2 id={`${t.id}-titre`}>{t.titre}</h2>
            <Questions items={t.items} ouvrirLaPremiere={i === 0} />
          </div>
        </section>
      ))}
      <JsonLd data={faqJsonLd(toutes)} />
    </>
  )
}

function Questions({
  items,
  ouvrirLaPremiere,
}: {
  items: readonly QuestionReponse[]
  ouvrirLaPremiere: boolean
}) {
  return (
    <div className="faq-aeo">
      {items.map((q, i) => (
        <details key={q.question} className="faq-aeo__item" open={ouvrirLaPremiere && i === 0}>
          <summary className="faq-aeo__question">
            <h3>{q.question}</h3>
          </summary>
          <p className="faq-aeo__reponse">{q.reponse}</p>
        </details>
      ))}
    </div>
  )
}
