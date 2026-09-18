/**
 * Decoupage Markdown generique — sections numerotees et tableaux.
 *
 * Aucune connaissance metier ici. `cahier.mjs`, `repartition.mjs` et les outils
 * SEO s'appuient dessus pour repondre DEPUIS le fichier, avec un numero de ligne
 * citable. Un outil qui ne peut pas citer une ligne est un outil qui invente.
 */

const RE_TITRE = /^(#{1,6})\s+(.*?)\s*$/

/**
 * @typedef {object} Section
 * @property {number} niveau      2 pour `##`, 3 pour `###`
 * @property {string|null} numero "1.3", "3.4"… ou null si le titre n'est pas numerote
 * @property {string} titre       titre sans son numero
 * @property {string} titre_brut
 * @property {number} ligne       1-indexe, ligne du titre
 * @property {number} ligne_fin   1-indexe, derniere ligne du corps
 * @property {string} corps
 * @property {string|null} parent numero de la section `##` englobante
 */

/**
 * @param {string} texte
 * @returns {Section[]}
 */
export function sections(texte) {
  const lignes = texte.split(/\r?\n/)
  /** @type {Section[]} */
  const trouvees = []

  lignes.forEach((ligne, i) => {
    const m = RE_TITRE.exec(ligne)
    if (!m) return
    const niveau = m[1].length
    const reste = m[2]
    const num = /^§?(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(reste)
    trouvees.push({
      niveau,
      numero: num ? num[1] : null,
      titre: num ? num[2] : reste,
      titre_brut: reste,
      ligne: i + 1,
      ligne_fin: lignes.length,
      corps: '',
      parent: null,
    })
  })

  trouvees.forEach((s, i) => {
    // Une section se termine a la premiere section de niveau <= au sien.
    let fin = lignes.length
    for (let j = i + 1; j < trouvees.length; j += 1) {
      if (trouvees[j].niveau <= s.niveau) {
        fin = trouvees[j].ligne - 1
        break
      }
    }
    s.ligne_fin = fin
    s.corps = lignes.slice(s.ligne, fin).join('\n')

    // Parent : la derniere section de niveau strictement inferieur.
    for (let j = i - 1; j >= 0; j -= 1) {
      if (trouvees[j].niveau < s.niveau) {
        s.parent = trouvees[j].numero
        break
      }
    }
  })

  return trouvees
}

/**
 * Retrouve une section par son numero : `section(txt, '1.3')` ou `section(txt, '§1.3')`.
 * @returns {Section|null}
 */
export function section(texte, reference) {
  const cible = String(reference || '').replace(/^§/, '').replace(/\.$/, '').trim()
  if (!cible) return null
  return sections(texte).find((s) => s.numero === cible) || null
}

/**
 * @typedef {object} Tableau
 * @property {string[]} entetes
 * @property {string[][]} lignes
 * @property {number} ligne_debut 1-indexe dans le texte fourni
 */

const estSeparateur = (l) => /^\|[\s:|-]+\|$/.test(l.trim())

/**
 * Decoupe une ligne `| a | b |` en cellules.
 *
 * Les backticks ne sont retires que si la cellule entiere est UN seul litteral :
 * « `boxe`, `mma-sol` » reste intacte, sinon on la transformerait en
 * « boxe`, `mma-sol », ce qui est exactement le genre d'invention qu'on combat.
 */
export function cellules(ligne) {
  return ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => {
      const t = c.trim()
      const seul = /^`([^`]*)`$/.exec(t)
      return seul ? seul[1].trim() : t
    })
}

/** Tous les litteraux entre backticks d'une chaine, dans l'ordre. */
export function litteraux(texte) {
  return [...String(texte || '').matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())
}

/**
 * Tous les tableaux Markdown d'un texte, dans l'ordre.
 * @param {string} texte
 * @param {number} [decalage] numero de la premiere ligne du texte dans le fichier
 * @returns {Tableau[]}
 */
export function tableaux(texte, decalage = 1) {
  const lignes = texte.split(/\r?\n/)
  /** @type {Tableau[]} */
  const out = []
  for (let i = 0; i < lignes.length - 1; i += 1) {
    if (!lignes[i].trim().startsWith('|')) continue
    if (!estSeparateur(lignes[i + 1])) continue
    const entetes = cellules(lignes[i])
    const corps = []
    let j = i + 2
    for (; j < lignes.length && lignes[j].trim().startsWith('|'); j += 1) {
      corps.push(cellules(lignes[j]))
    }
    out.push({ entetes, lignes: corps, ligne_debut: decalage + i })
    i = j
  }
  return out
}

/**
 * Cherche un motif dans un texte et renvoie les lignes correspondantes, citables.
 * @param {string} texte
 * @param {RegExp|string} motif
 * @param {number} [limite]
 * @returns {Array<{ ligne: number, texte: string }>}
 */
export function lignesQuiContiennent(texte, motif, limite = 20) {
  const lignes = texte.split(/\r?\n/)
  const test =
    motif instanceof RegExp
      ? (l) => motif.test(l)
      : (l) => l.toLowerCase().includes(String(motif).toLowerCase())
  const out = []
  for (let i = 0; i < lignes.length && out.length < limite; i += 1) {
    if (lignes[i].trim() && test(lignes[i])) out.push({ ligne: i + 1, texte: lignes[i].trim() })
  }
  return out
}
