/**
 * Briques communes aux trois familles d'outils.
 *
 * Deux invariants tenus ici, pour ne pas dependre de la discipline de chaque outil :
 *  - toute reponse est prefixee par sa NATURE (contrat, pas etat du systeme) — G9 ;
 *  - une absence se repond « ABSENT DU CONTRAT » + valeurs valides + « demander a Junior ».
 */

/** Annotations communes : lecture seule, hors ligne, idempotent (G4, G5). */
export const ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
})

const ENTETE =
  'CONTRAT (ce qui est EXIGE, pas ce que le code fait aujourd\'hui) — lu a l\'instant dans le depot.'

/** Reponse texte normale. */
export function texte(corps, sources = []) {
  const bas = sources.length
    ? `\n\nSources :\n${sources.filter(Boolean).map((s) => `  · ${s}`).join('\n')}`
    : ''
  return { content: [{ type: 'text', text: `${ENTETE}\n\n${corps}${bas}` }] }
}

/** Reponse texte + charge structuree (obligatoire des qu'un outputSchema est declare). */
export function structure(corps, donnees, sources = []) {
  const r = texte(corps, sources)
  return { ...r, structuredContent: donnees }
}

/**
 * Le contrat est muet : c'est une reponse utile, pas un echec.
 * `isError: true` pour que le modele la VOIE et se corrige (spec 06, V9).
 */
export function absent(quoi, valides, options = {}) {
  const liste = Array.isArray(valides) && valides.length ? `\nValeurs valides : ${valides.join(', ')}.` : ''
  const extra = options.detail ? `\n${options.detail}` : ''
  const r = {
    content: [
      {
        type: 'text',
        text:
          `ABSENT DU CONTRAT : ${quoi}${liste}${extra}\n` +
          `Ne pas inventer une valeur plausible : ouvrir la question avec Junior, ou faire une PR sur ` +
          `docs/CAHIER-API.md et docs/openapi.yaml ensemble (cahier §14).`,
      },
    ],
    isError: true,
  }
  if (options.donnees) r.structuredContent = options.donnees
  return r
}

/** Erreur de saisie de l'appelant (parametre manquant, format faux). */
export function invalide(message, options = {}) {
  const r = { content: [{ type: 'text', text: `ENTREE INVALIDE : ${message}` }], isError: true }
  if (options.donnees) r.structuredContent = options.donnees
  return r
}

/** Rendu d'une liste d'objets en tableau texte aligne, lisible par un modele. */
export function tableauTexte(lignes, colonnes) {
  if (!lignes.length) return '(aucune ligne)'
  const largeurs = colonnes.map((c) =>
    Math.max(c.titre.length, ...lignes.map((l) => String(valeur(l, c) ?? '').length)),
  )
  const barre = (cells) => cells.map((c, i) => String(c ?? '').padEnd(largeurs[i])).join('  ')
  return [
    barre(colonnes.map((c) => c.titre)),
    barre(largeurs.map((w) => '-'.repeat(w))),
    ...lignes.map((l) => barre(colonnes.map((c) => valeur(l, c)))),
  ].join('\n')
}

function valeur(ligne, colonne) {
  const v = typeof colonne.cle === 'function' ? colonne.cle(ligne) : ligne[colonne.cle]
  return v === null || v === undefined ? '—' : String(v)
}

/** JSON lisible, tronque si demesure (point NON VERIFIE de la spec : taille de reponse). */
export function json(valeurJs, limite = 60000) {
  const t = JSON.stringify(valeurJs, null, 2)
  if (t.length <= limite) return t
  return (
    `${t.slice(0, limite)}\n\n[... tronque a ${limite} caracteres sur ${t.length}. ` +
    `Affiner la question : demander un schema ou un endpoint precis plutot que la liste entiere.]`
  )
}

/** Normalisation sans accents, pour comparer des sujets saisis a la main. */
export function normaliser(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
