/**
 * Horloge `Europe/Paris` — jamais un decalage code en dur.
 *
 * Paris passe de UTC+2 a UTC+1 le dernier dimanche d'octobre. Une limite
 * d'annulation « 24 h avant » calculee en UTC naif se trompe d'une heure deux
 * fois par an, et ce bug-la ne se voit qu'en production, sur une vraie
 * reservation, un vrai samedi. Le decalage est donc TOUJOURS demande a
 * `Intl.DateTimeFormat` pour l'instant considere.
 */

export const FUSEAU = 'Europe/Paris'

const FORMATEUR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

const JOURS_ISO = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Les composantes de l'heure murale parisienne d'un instant. */
export function composantesParis(date) {
  const parts = {}
  for (const p of FORMATEUR.formatToParts(date)) parts[p.type] = p.value
  return {
    annee: Number(parts.year),
    mois: Number(parts.month),
    jour: Number(parts.day),
    heure: Number(parts.hour),
    minute: Number(parts.minute),
    seconde: Number(parts.second),
    jour_semaine: JOURS_ISO[parts.weekday],
    nom_jour: parts.weekday,
  }
}

/** Decalage de Paris, en minutes, pour cet instant precis (+120 l'ete, +60 l'hiver). */
export function decalageParis(date) {
  const c = composantesParis(date)
  const mural = Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute, c.seconde)
  return Math.round((mural - date.getTime()) / 60000)
}

function deuxChiffres(n) {
  return String(n).padStart(2, '0')
}

/** ISO 8601 avec le decalage parisien explicite : `2026-09-22T11:00:00+02:00`. */
export function isoParis(date) {
  const c = composantesParis(date)
  const off = decalageParis(date)
  const signe = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${c.annee}-${deuxChiffres(c.mois)}-${deuxChiffres(c.jour)}` +
    `T${deuxChiffres(c.heure)}:${deuxChiffres(c.minute)}:${deuxChiffres(c.seconde)}` +
    `${signe}${deuxChiffres(Math.floor(abs / 60))}:${deuxChiffres(abs % 60)}`
  )
}

/**
 * L'instant dont l'heure murale parisienne est celle demandee.
 * Deux iterations suffisent : la premiere approxime le decalage, la seconde le corrige.
 * Pendant le saut de printemps (02:00→03:00) l'heure demandee n'existe pas ; on
 * renvoie l'instant le plus proche et on le signale par `heure_inexistante`.
 */
export function instantParis(annee, mois, jour, heure, minute = 0, seconde = 0) {
  const mural = Date.UTC(annee, mois - 1, jour, heure, minute, seconde)
  let instant = new Date(mural)
  for (let i = 0; i < 3; i += 1) {
    const off = decalageParis(instant)
    const candidat = new Date(mural - off * 60000)
    if (candidat.getTime() === instant.getTime()) break
    instant = candidat
  }
  const verif = composantesParis(instant)
  const exact =
    verif.annee === annee &&
    verif.mois === mois &&
    verif.jour === jour &&
    verif.heure === heure &&
    verif.minute === minute
  return { instant, heure_inexistante: !exact, obtenu: verif }
}

/**
 * Analyse une date d'entree.
 * - avec decalage explicite (`+02:00`, `Z`) : on le respecte tel quel ;
 * - sans decalage (`2026-09-22T11:00`) : interprete comme heure murale PARISIENNE,
 *   et l'interpretation est annoncee dans le resultat.
 * @returns {{ instant: Date, interpretation: string, entree: string } | { erreur: string, entree: string }}
 */
export function analyserInstant(valeur) {
  const brut = String(valeur || '').trim()
  if (!brut) return { erreur: 'valeur vide', entree: brut }

  const avecDecalage = /(?:Z|[+-]\d{2}:?\d{2})$/.test(brut)
  if (avecDecalage) {
    const d = new Date(brut)
    if (Number.isNaN(d.getTime())) return { erreur: 'date ISO invalide', entree: brut }
    return {
      instant: d,
      interpretation: `decalage explicite dans l'entree, respecte tel quel (heure murale Paris correspondante : ${isoParis(d)})`,
      entree: brut,
    }
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(brut)
  if (!m) {
    return {
      erreur:
        'format non reconnu. Attendu : "2026-09-22T11:00:00+02:00", "2026-09-22T11:00" ou "2026-09-22".',
      entree: brut,
    }
  }
  const r = instantParis(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0),
  )
  return {
    instant: r.instant,
    interpretation: `aucun decalage dans l'entree : interprete comme heure murale ${FUSEAU}`,
    heure_inexistante: r.heure_inexistante,
    entree: brut,
  }
}

/** Ajoute des minutes ABSOLUES (duree physique), le decalage suit tout seul. */
export function plusMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

/**
 * Retire des heures CIVILES : meme heure murale, N heures plus tot au calendrier.
 * Le dernier dimanche d'octobre, 24 h civiles = 25 h absolues.
 */
export function moinsHeuresCiviles(date, heures) {
  const c = composantesParis(date)
  const total = c.heure - heures
  const jourDecale = Math.floor(total / 24)
  const heureFinale = ((total % 24) + 24) % 24
  return instantParis(c.annee, c.mois, c.jour + jourDecale, heureFinale, c.minute, c.seconde).instant
}
