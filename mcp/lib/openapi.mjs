/**
 * Index de `docs/openapi.yaml`.
 *
 * Le YAML est recharge quand le fichier change (mtime). Les `$ref` sont resolus
 * ici, une fois, avec garde anti-cycle : un outil qui renverrait `{ "$ref": "..." }`
 * a un modele lui ferait deviner la cible, et deviner est la maladie qu'on soigne.
 */

import YAML from 'yaml'
import { lire } from './sources.mjs'

export const FICHIER = 'docs/openapi.yaml'

const METHODES = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']

let cache = { sha: null, doc: null }

/** Le document OpenAPI analyse. @returns {{ doc: any, sha: string, chemin: string }} */
export function document() {
  const src = lire('openapi')
  if (cache.sha !== src.sha256) {
    cache = { sha: src.sha256, doc: YAML.parse(src.texte) }
  }
  return { doc: cache.doc, sha: src.sha256, chemin: FICHIER }
}

/** Resout un pointeur JSON local `#/a/b/c`. Renvoie `undefined` si absent. */
export function pointeur(doc, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined
  let noeud = doc
  for (const brut of ref.slice(2).split('/')) {
    const cle = brut.replace(/~1/g, '/').replace(/~0/g, '~')
    if (noeud == null || typeof noeud !== 'object') return undefined
    noeud = noeud[cle]
  }
  return noeud
}

/**
 * Dereference un noeud. Les cycles sont marques, jamais suivis a l'infini.
 * @param {any} noeud
 * @param {any} [doc]
 * @param {Set<string>} [enCours]
 */
export function deref(noeud, doc = document().doc, enCours = new Set()) {
  if (Array.isArray(noeud)) return noeud.map((n) => deref(n, doc, enCours))
  if (noeud == null || typeof noeud !== 'object') return noeud

  if (typeof noeud.$ref === 'string') {
    const ref = noeud.$ref
    if (enCours.has(ref)) {
      return { 'x-reference-circulaire': ref }
    }
    const cible = pointeur(doc, ref)
    if (cible === undefined) {
      return { 'x-reference-introuvable': ref }
    }
    const suite = new Set(enCours)
    suite.add(ref)
    const resolu = deref(cible, doc, suite)
    const reste = { ...noeud }
    delete reste.$ref
    return Object.keys(reste).length
      ? { ...resolu, ...deref(reste, doc, suite), 'x-origine': ref }
      : { ...resolu, 'x-origine': ref }
  }

  const out = {}
  for (const [k, v] of Object.entries(noeud)) out[k] = deref(v, doc, enCours)
  return out
}

/**
 * @typedef {object} Operation
 * @property {string} chemin
 * @property {string} methode  majuscules
 * @property {string|null} operationId
 * @property {string} summary
 * @property {string[]} tags
 * @property {any} brut  l'operation non dereferencee
 */

/** @returns {Operation[]} */
export function operations() {
  const { doc } = document()
  const paths = doc?.paths || {}
  /** @type {Operation[]} */
  const out = []
  for (const [chemin, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue
    for (const m of METHODES) {
      const op = item[m]
      if (!op || typeof op !== 'object') continue
      out.push({
        chemin,
        methode: m.toUpperCase(),
        operationId: op.operationId || null,
        summary: op.summary || '',
        tags: Array.isArray(op.tags) ? op.tags : [],
        brut: op,
        parametres_du_chemin: Array.isArray(item.parameters) ? item.parameters : [],
      })
    }
  }
  return out
}

/** Retrouve une operation par chemin (+ methode optionnelle). */
export function operation(chemin, methode) {
  const c = String(chemin || '').trim()
  const m = methode ? String(methode).toUpperCase() : null
  const toutes = operations()
  const candidates = toutes.filter((o) => o.chemin === c)
  if (!candidates.length) return null
  if (!m) return candidates.length === 1 ? candidates[0] : { ambigu: candidates }
  return candidates.find((o) => o.methode === m) || null
}

export function operationParId(operationId) {
  return operations().find((o) => o.operationId === operationId) || null
}

/** Les chemins declares, dans l'ordre du fichier. */
export function chemins() {
  const { doc } = document()
  return Object.keys(doc?.paths || {})
}

/** Les noms des schemas de `components.schemas`. */
export function nomsSchemas() {
  const { doc } = document()
  return Object.keys(doc?.components?.schemas || {})
}

/** Un schema, dereference par defaut. */
export function schema(nom, dereferencer = true) {
  const { doc } = document()
  const brut = doc?.components?.schemas?.[nom]
  if (brut === undefined) return null
  return dereferencer ? deref(brut, doc) : brut
}

/** L'enumeration d'un schema (`ErrorCode`, `ReservationStatus`…), ou null. */
export function enumeration(nom) {
  const s = schema(nom, true)
  return Array.isArray(s?.enum) ? s.enum : null
}

/** Les tags declares en tete de document. */
export function tags() {
  const { doc } = document()
  return (doc?.tags || []).map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
}

/** Les serveurs declares. */
export function serveurs() {
  const { doc } = document()
  return doc?.servers || []
}

/** `info` du document : titre, version. */
export function info() {
  const { doc } = document()
  return doc?.info || {}
}

/**
 * Ligne (1-indexee) ou apparait un chemin dans le YAML, pour pouvoir citer.
 * Recherche textuelle : le YAML n'expose pas ses positions apres analyse.
 */
export function ligneDuChemin(chemin) {
  const src = lire('openapi')
  const cible = `  ${chemin}:`
  const i = src.lignes.findIndex((l) => l === cible)
  return i >= 0 ? i + 1 : null
}

/** Ligne ou est declare un schema. */
export function ligneDuSchema(nom) {
  const src = lire('openapi')
  const cible = `    ${nom}:`
  const i = src.lignes.findIndex((l) => l === cible)
  return i >= 0 ? i + 1 : null
}
