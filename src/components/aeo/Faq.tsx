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
        <div className="faq-aeo">
          {items.map((q, i) => (
            <details key={q.question} className="faq-aeo__item" open={i === 0}>
              <summary className="faq-aeo__question">
                <h3>{q.question}</h3>
              </summary>
              <p className="faq-aeo__reponse">{q.reponse}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqJsonLd(items)} />
    </section>
  )
}
