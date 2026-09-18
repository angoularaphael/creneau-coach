/**
 * Index de `docs/CAHIER-API.md`.
 *
 * Chaque fonction relit le fichier (cache invalide par mtime) et renvoie des
 * donnees PORTANT LEUR LIGNE. Rien n'est code en dur ici : si le cahier change
 * un tarif ou un code d'erreur, l'index change avec lui. Si une section attendue
 * disparait, la fonction renvoie une liste vide et l'outil dit « absent », il
 * n'invente pas la valeur d'hier.
 */

import { lire } from './sources.mjs'
import { cellules, litteraux, section, sections, tableaux } from './markdown.mjs'

export const FICHIER = 'docs/CAHIER-API.md'

function texte() {
  return lire('cahier').texte
}

/** Le corps d'une section, avec le decalage de ligne pour pouvoir citer. */
export function corpsDeSection(ref) {
  const t = texte()
  const s = section(t, ref)
  if (!s) return null
  return { ...s, fichier: FICHIER }
}

/** Premier tableau d'une section, ou null. */
function tableauDeSection(ref) {
  const s = corpsDeSection(ref)
  if (!s) return null
  const tabs = tableaux(s.corps, s.ligne + 1)
  return tabs.length ? { ...tabs[0], section: ref, titre: s.titre } : null
}

// ---------------------------------------------------------------------------
// §1.3 — codes d'erreur
// ---------------------------------------------------------------------------

/** @returns {Array<{ code: string, http: number, sens: string, ligne: number }>} */
export function codesErreur() {
  const tab = tableauDeSection('1.3')
  if (!tab) return []
  return tab.lignes
    .map((cells, i) => {
      const http = Number.parseInt(cells[0], 10)
      const code = (cells[1] || '').replace(/`/g, '').trim()
      if (!Number.isFinite(http) || !code) return null
      return { code, http, sens: cells[2] || '', ligne: tab.ligne_debut + 2 + i }
    })
    .filter(Boolean)
}

/** La phrase anti-enumeration de §1.3, citee telle quelle. */
export function reglePasDEnumeration() {
  const s = corpsDeSection('1.3')
  if (!s) return null
  const lignes = s.corps.split(/\r?\n/)
  const i = lignes.findIndex((l) => /404|enumeration|énumération/i.test(l) && /coach/i.test(l))
  if (i < 0) return null
  return { fichier: FICHIER, ligne: s.ligne + 1 + i, texte: lignes[i].trim() }
}

// ---------------------------------------------------------------------------
// §1.2 en-tetes · §1.5 limites de debit
// ---------------------------------------------------------------------------

export function entetes() {
  const tab = tableauDeSection('1.2')
  if (!tab) return []
  return tab.lignes.map((c, i) => ({
    entete: c[0],
    quand: c[1],
    ligne: tab.ligne_debut + 2 + i,
  }))
}

export function limitesDeDebit() {
  const tab = tableauDeSection('1.5')
  if (!tab) return []
  return tab.lignes.map((c, i) => ({
    route: c[0],
    limite: c[1],
    ligne: tab.ligne_debut + 2 + i,
  }))
}

// ---------------------------------------------------------------------------
// §2 — machine a etats
// ---------------------------------------------------------------------------

export function statuts() {
  const tab = tableauDeSection('2')
  if (!tab) return []
  return tab.lignes.map((c, i) => ({
    statut: c[0],
    qui_le_pose: c[1],
    signification: c[2],
    ligne: tab.ligne_debut + 2 + i,
  }))
}

/** Les statuts « actifs » et la barriere de §2, lus dans le texte. */
export function reglesDeStatut() {
  const s = corpsDeSection('2')
  if (!s) return { actifs: [], barriere: null, diagramme: null, lignes: {} }
  const lignes = s.corps.split(/\r?\n/)

  const iActifs = lignes.findIndex((l) => /\*\*Actives?\*\*/i.test(l))
  const iBarriere = lignes.findIndex((l) => /\*\*Barri[eè]re/i.test(l))

  const bloc = /```([\s\S]*?)```/.exec(s.corps)

  return {
    actifs: iActifs >= 0 ? litteraux(lignes[iActifs]) : [],
    ligne_actifs: iActifs >= 0 ? s.ligne + 1 + iActifs : null,
    texte_actifs: iActifs >= 0 ? lignes[iActifs].trim() : null,
    barriere: iBarriere >= 0 ? lignes[iBarriere].trim() : null,
    ligne_barriere: iBarriere >= 0 ? s.ligne + 1 + iBarriere : null,
    diagramme: bloc ? bloc[1].trim() : null,
    section: '2',
    fichier: FICHIER,
  }
}

// ---------------------------------------------------------------------------
// §3.2 clubs et espaces · §3.3 creneaux types · §3.4 tarifs · §3.9 reglages
// ---------------------------------------------------------------------------

export function clubsEtEspaces() {
  const tab = tableauDeSection('3.2')
  if (!tab) return { clubs: [], capacite_defaut: null, ligne_capacite: null }
  const clubs = tab.lignes
    .map((c, i) => {
      const club = (c[0] || '').replace(/`/g, '').trim()
      if (!club) return null
      // `cellules` retire les backticks quand la cellule est UN seul litteral :
      // « salle » arrive donc nu, « `boxe`, `mma-sol` » arrive avec ses backticks.
      const brut = c[1] || ''
      const espaces = litteraux(brut).length
        ? litteraux(brut)
        : brut
            .split(',')
            .map((x) => x.replace(/`/g, '').trim())
            .filter(Boolean)
      return { club, espaces, ligne: tab.ligne_debut + 2 + i }
    })
    .filter(Boolean)

  const s = corpsDeSection('3.2')
  const lignes = s ? s.corps.split(/\r?\n/) : []
  const iCap = lignes.findIndex((l) => /capacit[ée]/i.test(l) && /\d/.test(l))
  const mCap = iCap >= 0 ? /\*\*(\d+)\*\*|(\d+)/.exec(lignes[iCap]) : null

  return {
    clubs,
    capacite_defaut: mCap ? Number.parseInt(mCap[1] || mCap[2], 10) : null,
    texte_capacite: iCap >= 0 ? lignes[iCap].trim() : null,
    ligne_capacite: iCap >= 0 && s ? s.ligne + 1 + iCap : null,
    section: '3.2',
    fichier: FICHIER,
  }
}

/**
 * §3.3 : plage horaire des creneaux types + blocages boxe educative par defaut.
 * Tout est extrait du texte, y compris le club exclu du defaut.
 */
export function creneauxTypes() {
  const s = corpsDeSection('3.3')
  if (!s) return null
  const lignes = s.corps.split(/\r?\n/)

  let plage = null
  let ligne_plage = null
  let jours_texte = null
  lignes.forEach((l, i) => {
    const m = /(\d{1,2}):00\s*(?:→|->|–|-)\s*(\d{1,2}):00/.exec(l)
    if (m && !plage && /lun/i.test(l)) {
      plage = { premiere_heure: Number(m[1]), fin_derniere: Number(m[2]) }
      ligne_plage = s.ligne + 1 + i
      jours_texte = l.trim()
    }
  })

  const JOURS = {
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
    dimanche: 0,
  }
  const blocages = []
  lignes.forEach((l, i) => {
    const mj = /^-\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.exec(l.trim())
    if (!mj) return
    const heures = [...l.matchAll(/(\d{1,2}):00\s*(?:–|-|→)\s*(\d{1,2}):00/g)].map((m) => Number(m[1]))
    if (!heures.length) return
    blocages.push({
      jour: mj[1].toLowerCase(),
      jour_iso: JOURS[mj[1].toLowerCase()],
      heures_debut: heures,
      texte: l.trim(),
      ligne: s.ligne + 1 + i,
    })
  })

  const iExclu = lignes.findIndex((l) => /sauf\s+\w+/i.test(l) && /param[ée]tr/i.test(l))
  const mExclu = iExclu >= 0 ? /sauf\s+([A-Za-zÀ-ÿ-]+)/i.exec(lignes[iExclu]) : null

  return {
    plage,
    ligne_plage,
    jours_texte,
    blocages,
    club_exclu_du_defaut: mExclu ? mExclu[1].toLowerCase() : null,
    texte_exclusion: iExclu >= 0 ? lignes[iExclu].trim() : null,
    ligne_exclusion: iExclu >= 0 ? s.ligne + 1 + iExclu : null,
    section: '3.3',
    fichier: FICHIER,
  }
}

/**
 * §3.4 : la grille tarifaire, lue dans le tableau.
 * @returns {Array<{ kind: string, heures_debut: number[], amount_cents: number, creneaux: string, ligne: number }>}
 */
export function tarifs() {
  const tab = tableauDeSection('3.4')
  if (!tab) return []
  return tab.lignes
    .map((c, i) => {
      const kind = (c[0] || '').replace(/`/g, '').trim()
      const creneaux = c[1] || ''
      const cents = Number.parseInt(String(c[2] || '').replace(/[^\d]/g, ''), 10)
      if (!kind || !Number.isFinite(cents)) return null
      const heures = [...creneaux.matchAll(/(\d{1,2})\s*(?:–|-|→)\s*(\d{1,2})/g)].map((m) =>
        Number(m[1]),
      )
      return {
        kind,
        heures_debut: heures,
        amount_cents: cents,
        creneaux: creneaux.trim(),
        ligne: tab.ligne_debut + 2 + i,
      }
    })
    .filter(Boolean)
}

/** §3.9 : les reglages direction et leurs valeurs par defaut. */
export function reglages() {
  const s = corpsDeSection('3.9')
  if (!s) return { valeurs: {}, texte: null, ligne: null }
  const lignes = s.corps.split(/\r?\n/)
  const i = lignes.findIndex((l) => /`\w+`\s*\(\d+\)/.test(l))
  if (i < 0) return { valeurs: {}, texte: null, ligne: null, section: '3.9', fichier: FICHIER }
  const valeurs = {}
  for (const m of lignes[i].matchAll(/`([a-z_]+)`\s*\((\d+)\)/g)) {
    valeurs[m[1]] = Number(m[2])
  }
  return {
    valeurs,
    texte: lignes[i].trim(),
    ligne: s.ligne + 1 + i,
    section: '3.9',
    fichier: FICHIER,
  }
}

/** §3.5 : les champs de `coach_reservations`, dont qr_valid_from / hold_expires_at. */
export function champsReservation() {
  const tab = tableauDeSection('3.5')
  if (!tab) return []
  return tab.lignes.map((c, i) => ({
    champ: (c[0] || '').replace(/`/g, '').trim(),
    type: c[1] || '',
    notes: c[2] || '',
    ligne: tab.ligne_debut + 2 + i,
  }))
}

// ---------------------------------------------------------------------------
// §11 evenements · §12 RLS · §13 tests
// ---------------------------------------------------------------------------

export function evenements() {
  const tab = tableauDeSection('11')
  if (!tab) return { lignes: [], notes: [] }
  const evts = tab.lignes
    .map((c, i) => {
      const lits = litteraux(c[0])
      const nom = lits[0] || (c[0] || '').trim()
      if (!nom) return null
      return {
        event: nom,
        precision: lits.length ? (c[0] || '').replace(/`[^`]*`/, '').trim() || null : null,
        producteur: c[1] || '',
        consommateurs: c[2] || '',
        ligne: tab.ligne_debut + 2 + i,
      }
    })
    .filter(Boolean)

  const s = corpsDeSection('11')
  const lignes = s ? s.corps.split(/\r?\n/) : []
  const notes = lignes
    .map((l, i) => ({ texte: l.trim(), ligne: s.ligne + 1 + i }))
    .filter((x) => x.texte && !x.texte.startsWith('|') && !/^#/.test(x.texte))

  return { lignes: evts, notes, section: '11', fichier: FICHIER }
}

export function matriceRls() {
  const tab = tableauDeSection('12')
  if (!tab) return { roles: [], tables: [], vues: [] }
  const roles = tab.entetes.slice(1).map((e) => e.replace(/`/g, '').trim())
  const tables = tab.lignes.map((c, i) => {
    const droits = {}
    roles.forEach((r, k) => {
      droits[r] = (c[k + 1] || '').trim()
    })
    return { table: (c[0] || '').replace(/`/g, '').trim(), droits, ligne: tab.ligne_debut + 2 + i }
  })

  const s = corpsDeSection('12')
  const lignes = s ? s.corps.split(/\r?\n/) : []
  const vues = lignes
    .map((l, i) => ({ texte: l.trim(), ligne: s.ligne + 1 + i }))
    .filter((x) => /vue/i.test(x.texte) && !x.texte.startsWith('|'))

  return { roles, tables, vues, section: '12', fichier: FICHIER }
}

/** §13 : la liste numerotee des tests contractuels. */
export function testsContractuels() {
  const s = corpsDeSection('13')
  if (!s) return []
  const lignes = s.corps.split(/\r?\n/)
  const out = []
  lignes.forEach((l, i) => {
    const m = /^\s*(\d+)\.\s+(.*)$/.exec(l)
    if (!m) return
    const enonce = m[2].trim()
    out.push({
      numero: Number(m[1]),
      enonce,
      codes: codesCites(enonce),
      http_cites: [...new Set([...enonce.matchAll(/([1-5]\d{2})/g)].map((m) => Number(m[1])))],
      ligne: s.ligne + 1 + i,
      fichier: FICHIER,
      section: '13',
    })
  })
  return out
}

/** Les codes d'erreur du contrat cites dans une phrase. */
export function codesCites(phrase) {
  const connus = new Set(codesErreur().map((c) => c.code))
  const trouves = new Set()
  for (const mot of String(phrase || '').matchAll(/\b[A-Z][A-Z_]{3,}\b/g)) {
    if (connus.has(mot[0])) trouves.add(mot[0])
  }
  return [...trouves]
}

// ---------------------------------------------------------------------------
// Index des endpoints : `### `POST /reservations`` → section parente → lot
// ---------------------------------------------------------------------------

const NOM_VERS_LOT = { eddy: 'C', raphael: 'A', brad: 'B' }

/**
 * Le lot responsable d'une section `##`, deduit du NOM present dans son titre.
 * `## 6. Reservations — Eddy (Brad consomme…)` → Eddy → lot C.
 */
export function lotDUneSection(numeroSection) {
  const t = texte()
  const s = sections(t).find((x) => x.numero === numeroSection && x.niveau === 2)
  if (!s) return null
  const m = /(Eddy|Raphael|Raphaël|Brad)/i.exec(s.titre_brut)
  if (!m) return null
  const nom = m[1].toLowerCase().replace('ë', 'e')
  return {
    lot: NOM_VERS_LOT[nom] || null,
    responsable: m[1],
    titre_section: s.titre_brut,
    section: numeroSection,
    ligne: s.ligne,
    fichier: FICHIER,
  }
}

/**
 * Tous les endpoints documentes par un titre `### \`METHOD /chemin\``.
 * Un titre peut en porter plusieurs (« `POST /x` / `DELETE /x/{id}` »).
 * @returns {Array<{ methode: string, chemin: string, ligne: number, section: string|null, titre: string }>}
 */
export function endpoints() {
  const t = texte()
  const out = []
  for (const s of sections(t)) {
    if (s.niveau < 3) continue
    for (const lit of litteraux(s.titre_brut)) {
      const m = /^(GET|POST|PATCH|PUT|DELETE)\s+(\/\S*)$/i.exec(lit.trim())
      if (!m) continue
      out.push({
        methode: m[1].toUpperCase(),
        chemin: m[2].split('?')[0],
        ligne: s.ligne,
        ligne_fin: s.ligne_fin,
        section: s.parent,
        titre: s.titre_brut,
        corps: s.corps,
      })
    }
  }
  return out
}

/** Retrouve un endpoint du cahier. Comparaison exacte sur le chemin. */
export function endpoint(methode, chemin) {
  const m = String(methode || '').toUpperCase()
  const c = String(chemin || '').trim()
  return (
    endpoints().find((e) => e.methode === m && e.chemin === c) ||
    endpoints().find((e) => e.chemin === c) ||
    null
  )
}
