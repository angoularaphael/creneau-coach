/**
 * Contrôle des imbrications HTML invalides — `node scripts/verifier-imbrications.mjs`
 *
 * ── POURQUOI CE SCRIPT EXISTE ──────────────────────────────────────────────
 *
 * Un `<form>` s'était glissé dans un `<p>`. En HTML, un paragraphe n'accepte
 * que du contenu de phrasé : le navigateur REFERME donc le paragraphe tout
 * seul avant le formulaire. L'arbre construit côté client cesse de ressembler
 * au HTML envoyé par le serveur, React refuse d'hydrater, et c'est TOUTE LA
 * PAGE qui perd ses interactions — pas seulement l'élément fautif.
 *
 * Le piège, c'est que la page s'affiche parfaitement. Rien ne manque à l'œil.
 * Seule la console le dit, et seulement en développement.
 *
 * Ce contrôle existe donc pour que ça ne se redécouvre pas par hasard.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *
 * Il lit du texte, il ne construit pas d'arbre JSX. Il ne voit donc pas une
 * imbrication répartie entre deux composants (`<p>` dans l'un, `<form>` dans
 * l'autre). C'est un filet, pas une preuve : la vérification qui fait foi
 * reste la console d'un onglet neuf.
 *
 * Il vaut quand même : le cas qui nous a coûté une page entière était dans un
 * seul fichier, et il l'aurait attrapé.
 */

import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(RACINE, 'src')

/**
 * Les imbrications que le navigateur corrige de lui-même.
 *
 * C'est le critère : on ne liste pas « ce qui est laid », on liste ce que
 * l'analyseur HTML RÉÉCRIT — puisque c'est la réécriture qui fait diverger le
 * client du serveur.
 */
const REGLES = [
  {
    parent: 'p',
    interdits: ['form', 'div', 'ul', 'ol', 'section', 'article', 'table', 'h1', 'h2', 'h3', 'h4', 'pre', 'figure', 'blockquote'],
    raison: 'un paragraphe n’accepte que du contenu de phrasé',
  },
  {
    parent: 'button',
    interdits: ['form', 'div', 'a', 'button', 'ul', 'ol', 'table', 'h1', 'h2', 'h3'],
    raison: 'un bouton n’accepte ni élément interactif ni bloc',
  },
  {
    parent: 'a',
    interdits: ['a', 'button', 'form'],
    raison: 'un lien ne peut pas en contenir un autre, ni un bouton',
  },
  { parent: 'form', interdits: ['form'], raison: 'les formulaires ne s’imbriquent pas' },
  { parent: 'label', interdits: ['label'], raison: 'les étiquettes ne s’imbriquent pas' },
]

/** Les commentaires ne sont pas du balisage — sans ça, ce fichier se signale lui-même. */
function sansCommentaires(texte) {
  return texte.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function fichiersTsx(dossier) {
  const sortie = []
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersTsx(chemin))
    else if (entree.endsWith('.tsx')) sortie.push(chemin)
  }
  return sortie
}

const trouves = []

for (const fichier of fichiersTsx(SOURCE)) {
  const texte = sansCommentaires(readFileSync(fichier, 'utf8'))

  for (const { parent, interdits, raison } of REGLES) {
    const ouvertures = texte.matchAll(new RegExp(`<${parent}(?:\\s[^>]*)?>`, 'g'))

    for (const m of ouvertures) {
      const reste = texte.slice(m.index + m[0].length)
      const fin = reste.indexOf(`</${parent}>`)
      if (fin < 0) continue

      const dedans = reste.slice(0, fin)
      const fautif = interdits.find((b) => new RegExp(`<${b}(?:\\s|>|/)`).test(dedans))
      if (!fautif) continue

      const ligne = texte.slice(0, m.index).split('\n').length
      trouves.push(`${relative(RACINE, fichier)}:${ligne}\n    <${parent}> contient <${fautif}> — ${raison}`)
    }
  }
}

const uniques = [...new Set(trouves)]

if (uniques.length === 0) {
  console.log('Imbrications HTML : rien à signaler.')
  process.exit(0)
}

console.error(`\nImbrications invalides — ${uniques.length} cas.`)
console.error('Chacune casse l’hydratation de la page entière, pas seulement l’élément.\n')
for (const t of uniques) console.error('  ' + t + '\n')
process.exit(1)
