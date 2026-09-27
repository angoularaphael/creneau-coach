/**
 * Le texte d'un document juridique, découpé en blocs — UNE lecture, deux
 * rendus : le PDF signé (`pdf-juridique.ts`) et la page HTML publique.
 *
 * Markdown volontairement réduit : ce qu'un contrat utilise, rien de plus.
 *   `## Titre`      article
 *   `### Titre`     sous-titre
 *   `- élément`     liste (une ligne par élément)
 *   `**gras**`      mise en valeur dans une ligne
 *   ligne vide      fin de paragraphe
 *
 * Un seul analyseur garantit que le coach lit à l'écran exactement la
 * structure du PDF qu'il signe : mêmes articles, mêmes listes, même gras.
 */

export type Segment = { readonly texte: string; readonly gras: boolean }

export type Bloc =
  | { readonly type: 'article'; readonly texte: string; readonly ancre: string }
  | { readonly type: 'sous-titre'; readonly texte: string }
  | { readonly type: 'paragraphe'; readonly segments: readonly Segment[] }
  | { readonly type: 'liste'; readonly elements: readonly (readonly Segment[])[] }

export function segments(ligne: string): Segment[] {
  const morceaux = ligne.split('**')
  // Un nombre pair de morceaux veut dire un `**` orphelin : on le garde tel quel
  // plutôt que de mettre en gras la moitié d'un article.
  if (morceaux.length % 2 === 0) return [{ texte: ligne, gras: false }]
  return morceaux.map((texte, i) => ({ texte, gras: i % 2 === 1 })).filter((s) => s.texte !== '')
}

/** « Article 7 — Prix et paiement » → « article-7 » ; sinon, un repli lisible. */
export function ancre(titre: string): string {
  const article = /^article\s+(\d+)/i.exec(titre)
  if (article) return `article-${article[1]}`
  return (
    titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'section'
  )
}

export function analyser(source: string): Bloc[] {
  const blocs: Bloc[] = []
  let paragraphe: string[] = []
  let liste: Segment[][] = []

  const fermer = () => {
    if (paragraphe.length) {
      blocs.push({ type: 'paragraphe', segments: segments(paragraphe.join(' ')) })
      paragraphe = []
    }
    if (liste.length) {
      blocs.push({ type: 'liste', elements: liste })
      liste = []
    }
  }

  for (const brute of source.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trim()
    if (!ligne) {
      fermer()
      continue
    }
    if (ligne.startsWith('## ')) {
      fermer()
      const texte = ligne.slice(3).trim()
      blocs.push({ type: 'article', texte, ancre: ancre(texte) })
    } else if (ligne.startsWith('### ')) {
      fermer()
      blocs.push({ type: 'sous-titre', texte: ligne.slice(4).trim() })
    } else if (ligne.startsWith('- ')) {
      if (paragraphe.length) {
        blocs.push({ type: 'paragraphe', segments: segments(paragraphe.join(' ')) })
        paragraphe = []
      }
      liste.push(segments(ligne.slice(2).trim()))
    } else {
      if (liste.length) {
        blocs.push({ type: 'liste', elements: liste })
        liste = []
      }
      paragraphe.push(ligne)
    }
  }
  fermer()
  return blocs
}
