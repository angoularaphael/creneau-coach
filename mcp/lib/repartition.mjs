/**
 * Index de `docs/REPARTITION-TACHES.md` — l'outil anti-collision.
 *
 * « Qui ecrit le webhook Payplug ? » → lot A, Raphael, ne pas y toucher.
 * Deux lots qui ecrivent le meme endpoint, c'est la panne d'integration la plus
 * chere du projet. Cet index la rend interrogeable avant d'ecrire, pas apres.
 */

import { lire } from './sources.mjs'
import { cellules, sections, tableaux } from './markdown.mjs'

export const FICHIER = 'docs/REPARTITION-TACHES.md'

function texte() {
  return lire('repartition').texte
}

/** Le tableau de tete : lot → responsable → perimetre. */
export function lots() {
  const t = texte()
  for (const tab of tableaux(t, 1)) {
    const e = tab.entetes.map((x) => x.toLowerCase())
    if (e[0] === 'lot' && tab.lignes.length >= 3) {
      return tab.lignes
        .map((c, i) => ({
          lot: (c[0] || '').replace(/\*/g, '').trim(),
          responsable: (c[1] || '').replace(/\*/g, '').trim(),
          perimetre: (c[2] || '').trim(),
          ligne: tab.ligne_debut + 2 + i,
        }))
        .filter((x) => x.lot)
    }
  }
  return []
}

/** Le lot d'une section `## 1. Raphael — Lot A`. */
function lotDuTitre(titre) {
  const m = /Lot\s+([ABC])\b/i.exec(titre || '')
  if (m) return m[1].toUpperCase()
  if (/semaine\s*0/i.test(titre || '')) return 'ABC'
  return null
}

/**
 * Toutes les lignes de checklist du document, avec leur lot et leur etat.
 * @returns {Array<{ lot: string|null, responsable: string|null, section: string, sous_section: string,
 *   etat: string, texte: string, ligne: number }>}
 */
export function taches() {
  const t = texte()
  const secs = sections(t)
  const lignes = t.split(/\r?\n/)

  /** Pour chaque ligne du fichier : la section `##` et la `###` en cours. */
  const contexte = new Array(lignes.length + 1).fill(null)
  let courant = { section: '', sous_section: '', lot: null, responsable: null }
  for (let i = 0; i < lignes.length; i += 1) {
    const s = secs.find((x) => x.ligne === i + 1)
    if (s) {
      if (s.niveau === 2) {
        const lot = lotDuTitre(s.titre_brut)
        const mResp = /(Raphael|Raphaël|Brad|Eddy)/i.exec(s.titre_brut)
        courant = {
          section: s.titre_brut,
          sous_section: '',
          lot,
          responsable: mResp ? mResp[1] : null,
        }
      } else if (s.niveau === 3) {
        courant = { ...courant, sous_section: s.titre_brut }
      }
    }
    contexte[i] = courant
  }

  const out = []
  lignes.forEach((l, i) => {
    const m = /^\s*-\s*\[([ x~])\]\s*(.*)$/.exec(l)
    if (!m) return
    const c = contexte[i] || {}
    out.push({
      lot: c.lot || null,
      responsable: c.responsable || null,
      section: c.section || '',
      sous_section: c.sous_section || '',
      etat: m[1] === 'x' ? 'livre' : m[1] === '~' ? 'en_cours' : 'a_faire',
      texte: m[2].trim(),
      ligne: i + 1,
      fichier: FICHIER,
    })
  })
  return out
}

/** Les lignes « **Bloque Brad :** … » — qui attend quoi. */
export function blocages() {
  const t = texte()
  const lignes = t.split(/\r?\n/)
  const out = []
  lignes.forEach((l, i) => {
    const m = /\*\*(Bloque[^:*]*|Attend[^:*]*)\s*:\*\*\s*(.*)$/i.exec(l)
    if (!m) return
    out.push({ quoi: m[1].trim(), detail: m[2].trim(), ligne: i + 1, fichier: FICHIER })
  })
  return out
}

/** §6 : qui remplit quelles variables d'environnement. */
export function envQuiRemplit() {
  const t = texte()
  const secs = sections(t)
  const s = secs.find((x) => x.numero === '6')
  if (!s) return []
  const tabs = tableaux(s.corps, s.ligne + 1)
  if (!tabs.length) return []
  return tabs[0].lignes.map((c, i) => ({
    variables: c[0] || '',
    qui: (c[1] || '').replace(/\*/g, '').trim(),
    ligne: tabs[0].ligne_debut + 2 + i,
    fichier: FICHIER,
  }))
}

/** Ce que personne ne doit faire — la liste « Hors lot ». */
export function horsLot() {
  const t = texte()
  const lignes = t.split(/\r?\n/)
  const out = []
  lignes.forEach((l, i) => {
    if (/hors\s+lot/i.test(l) || /Hors contrat/i.test(l)) {
      out.push({ texte: l.trim(), ligne: i + 1, fichier: FICHIER })
    }
  })
  return out
}

/**
 * Recherche par sujet : renvoie les taches dont le texte, la sous-section ou la
 * section contient le terme. Insensible a la casse et aux accents.
 */
export function chercher(sujet) {
  const q = normaliser(sujet)
  if (!q) return []
  const mots = q.split(/\s+/).filter((m) => m.length > 2)
  const cible = mots.length ? mots : [q]
  return taches()
    .map((t) => {
      const foin = normaliser(`${t.texte} ${t.sous_section} ${t.section}`)
      const score = cible.reduce((n, m) => n + (foin.includes(m) ? 1 : 0), 0)
      return { ...t, score }
    })
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function normaliser(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
