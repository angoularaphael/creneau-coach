/**
 * Liste blanche de fichiers — G1, G2, G3.
 *
 * Le serveur MCP ne lit QUE les huit fichiers declares ici. Aucun outil ne prend
 * un chemin en parametre : il n'y a donc aucune entree utilisateur qui atteigne
 * le systeme de fichiers, et donc aucune traversee de repertoire possible.
 *
 * Interdits explicites, verifies a chaque lecture :
 *   .env, .env.local, .env.production, .env.test, bot/.env — jamais, sous aucune cle.
 *
 * .env.example est lu UNIQUEMENT pour en extraire les NOMS de variables :
 * l'analyseur coupe a la premiere « = » et jette la partie droite (voir env.mjs).
 * La valeur ne remonte jamais dans un resultat d'outil.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = path.dirname(fileURLToPath(import.meta.url))

/** Racine du depot. `.mcp.json` passe `MCP_CONTRAT_RACINE=${CLAUDE_PROJECT_DIR}`. */
export const RACINE = path.resolve(process.env.MCP_CONTRAT_RACINE || path.join(ICI, '..', '..'))

/**
 * Les seuls chemins lisibles. Litteraux, relatifs a la racine, figes au chargement
 * du module. Toute cle absente de cet objet est un refus, pas une lecture.
 */
export const FICHIERS = Object.freeze({
  cahier: 'docs/CAHIER-API.md',
  openapi: 'docs/openapi.yaml',
  repartition: 'docs/REPARTITION-TACHES.md',
  seo: 'docs/SEO-INFORMATION-ARCHITECTURE.md',
  deciplus: 'docs/DECIPLUS-ACCESS-CONTRACT.md',
  etat: 'docs/PROJECT-STATE.md',
  domaine: 'src/domain/contrat.ts',
  env_exemple: '.env.example',
})

export const CLES = Object.freeze(Object.keys(FICHIERS))

/** Noms de fichiers qui portent des valeurs reelles : refus categorique (G1). */
const INTERDITS = [
  /(^|[\\/])\.env$/i,
  /(^|[\\/])\.env\.(local|production|development|test|staging)$/i,
  /(^|[\\/])bot[\\/]\.env/i,
  /(^|[\\/])\.env\.[^\\/]*\.local$/i,
]

const cache = new Map()

/**
 * @typedef {object} Source
 * @property {string} cle
 * @property {string} chemin     chemin relatif, tel qu'il doit etre cite
 * @property {string} absolu
 * @property {string} texte
 * @property {string} sha256
 * @property {string} modifie_le ISO UTC
 * @property {number} octets
 * @property {string[]} lignes
 */

function resoudre(cle) {
  const relatif = FICHIERS[cle]
  if (!relatif) {
    throw new Error(
      `Cle de fichier hors liste blanche : "${cle}". Cles valides : ${CLES.join(', ')}.`,
    )
  }
  const absolu = path.resolve(RACINE, relatif)

  // Confinement : path.relative, pas un startsWith sur la chaine.
  const rel = path.relative(RACINE, absolu)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refus : "${relatif}" sort de la racine ${RACINE}.`)
  }

  // G1 : jamais un fichier de secrets, meme si la liste blanche etait modifiee.
  for (const motif of INTERDITS) {
    if (motif.test(absolu)) {
      throw new Error(`Refus categorique (G1) : "${relatif}" est un fichier de secrets.`)
    }
  }

  // Un lien symbolique peut pointer n'importe ou : refus.
  let stat
  try {
    stat = fs.lstatSync(absolu)
  } catch {
    return { absolu, relatif, stat: null }
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refus : "${relatif}" est un lien symbolique.`)
  }
  return { absolu, relatif, stat }
}

/**
 * Lit un fichier de la liste blanche. Cache invalide par mtime + taille :
 * le contrat bouge pendant la session, les outils doivent le voir.
 * @param {string} cle
 * @returns {Source}
 */
export function lire(cle) {
  const { absolu, relatif, stat } = resoudre(cle)
  if (!stat || !stat.isFile()) {
    throw new Error(`FICHIER ABSENT : ${relatif} n'existe pas dans le depot (${RACINE}).`)
  }

  const empreinte = `${stat.mtimeMs}:${stat.size}`
  const enCache = cache.get(cle)
  if (enCache && enCache.empreinte === empreinte) return enCache.source

  const texte = fs.readFileSync(absolu, 'utf8')
  /** @type {Source} */
  const source = {
    cle,
    chemin: relatif,
    absolu,
    texte,
    sha256: createHash('sha256').update(texte, 'utf8').digest('hex'),
    modifie_le: new Date(stat.mtimeMs).toISOString(),
    octets: stat.size,
    lignes: texte.split(/\r?\n/),
  }
  cache.set(cle, { empreinte, source })
  return source
}

/** Comme `lire`, mais renvoie null si le fichier manque au lieu de lever. */
export function lireSiPresent(cle) {
  try {
    return lire(cle)
  } catch (e) {
    if (String(e.message).startsWith('FICHIER ABSENT')) return null
    throw e
  }
}

/** Etat de chaque fichier de contrat, sans son contenu. Pour `contrat_version`. */
export function etatDesFichiers() {
  return CLES.map((cle) => {
    const s = lireSiPresent(cle)
    return s
      ? { cle, chemin: s.chemin, sha256: s.sha256, modifie_le: s.modifie_le, octets: s.octets }
      : { cle, chemin: FICHIERS[cle], sha256: null, modifie_le: null, octets: null, absent: true }
  })
}

/** Numero de ligne (1-indexe) d'un index de caractere dans un texte. */
export function ligneDe(texte, index) {
  if (index < 0) return 0
  let n = 1
  for (let i = 0; i < index && i < texte.length; i += 1) {
    if (texte[i] === '\n') n += 1
  }
  return n
}
