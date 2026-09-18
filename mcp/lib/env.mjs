/**
 * Lecture de `.env.example` — G1, garantie STRUCTURELLE.
 *
 * L'analyseur coupe a la premiere « = » et jette la partie droite. La valeur
 * n'est jamais affectee a une variable, jamais mise dans un objet, jamais
 * renvoyee. `SUPABASE_SERVICE_ROLE_KEY` est un nom connu du serveur ; sa valeur
 * ne l'est pas et ne peut pas l'etre.
 *
 * Ce fichier ne lit JAMAIS `.env`, `.env.local`, `.env.production`, `bot/.env` :
 * la liste blanche de `sources.mjs` ne les contient pas et les refuse en dur.
 */

import { lire } from './sources.mjs'
import { envQuiRemplit } from './repartition.mjs'
import { normaliser } from './repartition.mjs'

export const FICHIER = '.env.example'

/** Un nom de variable qui porte un secret. Heuristique volontairement large. */
const MOTS_SECRET = ['SECRET', 'KEY', 'PASSWORD', 'PASS', 'TOKEN', 'CREDENTIAL', 'PRIVATE']

function estSecret(nom) {
  if (nom.startsWith('NEXT_PUBLIC_')) return false
  return MOTS_SECRET.some((m) => nom.includes(m))
}

/**
 * @typedef {object} Variable
 * @property {string} nom
 * @property {string} section      le commentaire `# --- … ---` au-dessus
 * @property {string[]} proprietaires noms lus dans l'entete de section
 * @property {boolean} commentee    la ligne est prefixee par `#` dans le modele
 * @property {boolean} secret
 * @property {boolean} interdit_navigateur
 * @property {number} ligne
 */

/**
 * Tous les noms de variables du modele. AUCUNE valeur ne quitte cette fonction.
 * @returns {Variable[]}
 */
export function variables() {
  const src = lire('env_exemple')
  /** @type {Variable[]} */
  const out = []
  let section = ''
  let proprietaires = []

  src.lignes.forEach((ligneBrute, i) => {
    const ligne = ligneBrute.trimEnd()

    const entete = /^#\s*-{2,}\s*(.*?)\s*-{2,}\s*$/.exec(ligne)
    if (entete) {
      section = entete[1].trim()
      proprietaires = [...section.matchAll(/(Eddy|Raphael|Raphaël|Brad|BotHosting|Vercel)/gi)].map(
        (m) => m[1],
      )
      return
    }

    // Ligne de variable, commentee ou non.
    const m = /^(#\s*)?([A-Z][A-Z0-9_]*)\s*=/.exec(ligne)
    if (!m) return

    // --- LA COUPE (G1) -----------------------------------------------------
    // On ne prend QUE le groupe 2 de la capture : le nom. La partie droite de
    // la ligne n'est jamais lue, jamais copiee, jamais renvoyee.
    const nom = m[2]
    // -----------------------------------------------------------------------

    out.push({
      nom,
      section,
      proprietaires: [...new Set(proprietaires)],
      commentee: Boolean(m[1]),
      secret: estSecret(nom),
      interdit_navigateur: !nom.startsWith('NEXT_PUBLIC_'),
      ligne: i + 1,
      fichier: FICHIER,
    })
  })

  return out
}

/** Une variable par son nom exact, ou null. */
export function variable(nom) {
  const cible = String(nom || '').trim().toUpperCase()
  return variables().find((v) => v.nom === cible) || null
}

/**
 * Qui remplit une variable, croise avec le tableau §6 de REPARTITION-TACHES.md.
 * @returns {{ lot: string|null, qui: string|null, source: string|null }}
 */
export function proprietaire(nom) {
  const regles = envQuiRemplit()
  const n = String(nom || '').toUpperCase()

  for (const r of regles) {
    // Le tableau §6 cite des motifs : `SUPABASE_*`, `PAYPLUG_*`, `QR_HMAC_SECRET`…
    for (const motif of r.variables.split(/[,·]/)) {
      const propre = motif.replace(/`/g, '').replace(/\*\*/g, '').trim()
      if (!propre) continue
      const base = propre.replace(/\*$/, '')
      if (!base) continue
      const correspond = propre.endsWith('*') ? n.startsWith(base.toUpperCase()) : n === base.toUpperCase()
      if (correspond) {
        return {
          qui: r.qui,
          lot: lotDeLaPersonne(r.qui),
          source: `${r.fichier} §6, ligne ${r.ligne}`,
          regle: r.variables,
        }
      }
    }
  }
  return { qui: null, lot: null, source: null, regle: null }
}

function lotDeLaPersonne(qui) {
  const n = normaliser(qui)
  if (n.includes('eddy')) return 'C'
  if (n.includes('raphael')) return 'A'
  if (n.includes('brad')) return 'B'
  return null
}

/**
 * Ou vit la variable : Vercel (app), BotHosting (bot), ou local seulement.
 * Deduit de `.env.example` lui-meme : la section « Interdit sur Vercel » et les
 * mentions BotHosting sont ecrites dans le fichier, pas devinees ici.
 */
export function emplacement(v) {
  const s = normaliser(v?.section)
  if (s.includes('interdit sur vercel') || s.includes('bothosting')) return 'BotHosting'
  if (normaliser(v?.nom).startsWith('database_url')) return 'local'
  return 'Vercel'
}
