/**
 * L'HEURE, DITE COMME UN COACH LA DIT — partagé serveur et navigateur.
 *
 * Tout passe par `Europe/Paris`, jamais par le fuseau de la machine : un
 * serveur à Francfort et un téléphone resté à l'heure de Montréal doivent
 * afficher la même heure de séance. C'est aussi ce qui évite qu'un rendu
 * serveur et son hydratation se contredisent sur « demain » ou « aujourd'hui ».
 *
 * Aucune dépendance au DOM ni au serveur : ce fichier est importé des deux côtés.
 */

import { FUSEAU_METIER } from '@/domain/contrat'

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_METIER, ...o })

const F_HEURE = fmt({ hour: '2-digit', minute: '2-digit' })
const F_JOUR_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const F_JOUR_ANNEE = fmt({ day: 'numeric', month: 'long', year: 'numeric' })
const F_JOUR_MOIS = fmt({ day: 'numeric', month: 'long' })
const F_SEMAINE = fmt({ weekday: 'short' })
const F_JOUR = fmt({ day: '2-digit' })
const F_MOIS = fmt({ month: 'short' })
const F_DATE_COURTE = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' })
const F_YMD = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })
const F_MOIS_ANNEE = fmt({ month: 'long', year: 'numeric' })

export const MINUTE = 60_000
export const HEURE = 60 * MINUTE
export const JOUR = 24 * HEURE

/** « 10:00 » */
export const heure = (iso: string | number) => F_HEURE.format(new Date(iso))

/** « samedi 3 octobre » */
export const jourLong = (iso: string | number) => F_JOUR_LONG.format(new Date(iso))

/** « 5 octobre » — quand le nom du jour est déjà dit à côté. */
export const jourMois = (iso: string | number) => F_JOUR_MOIS.format(new Date(iso))

/** « 3 octobre 2026 » */
export const jourAnnee = (iso: string | number) => F_JOUR_ANNEE.format(new Date(iso))

/** « 02/10/2026 » — la forme d'un relevé, alignée en colonne. */
export const dateCourte = (iso: string | number) => F_DATE_COURTE.format(new Date(iso))

/** « octobre 2026 » */
export const moisAnnee = (iso: string | number) => F_MOIS_ANNEE.format(new Date(iso))

/** « 10:00 — 11:00 » : l'heure louée, d'un bloc. */
export const plage = (debut: string, fin: string) => `${heure(debut)} — ${heure(fin)}`

/**
 * La fenêtre de date d'une montre : jour de semaine, quantième, mois. Les
 * points abrégés (« sam. », « oct. ») sont retirés : dans une case de trois
 * lettres en capitales, le point se lit comme une tache.
 */
export function guichet(iso: string) {
  const d = new Date(iso)
  return {
    semaine: F_SEMAINE.format(d).replace('.', ''),
    jour: F_JOUR.format(d),
    mois: F_MOIS.format(d).replace('.', ''),
  }
}

/** Le jour civil à Paris, en nombre de jours depuis l'origine — pour comparer deux dates. */
function jourCivil(ms: number): number {
  const [a, m, j] = F_YMD.format(new Date(ms)).split('/').reverse().map(Number)
  return Date.UTC(a ?? 1970, (m ?? 1) - 1, j ?? 1) / JOUR
}

/** Écart en jours CIVILS (pas en tranches de 24 h) : à 23 h, une séance à 9 h est « demain ». */
export function ecartJours(iso: string, maintenant: number): number {
  return jourCivil(new Date(iso).getTime()) - jourCivil(maintenant)
}

/**
 * « Aujourd'hui », « Demain », « Mardi », ou la date. Au-delà d'une semaine,
 * un nom de jour devient ambigu (lequel, des deux mardis ?) : on donne la date.
 */
export function jourRelatif(iso: string, maintenant: number): string {
  const e = ecartJours(iso, maintenant)
  if (e === 0) return 'Aujourd’hui'
  if (e === 1) return 'Demain'
  if (e === -1) return 'Hier'
  const long = jourLong(iso)
  if (e > 1 && e < 7) return long.split(' ')[0]!.replace(/^./, (c) => c.toUpperCase())
  return long.replace(/^./, (c) => c.toUpperCase())
}

export const deux = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0')

/** Un écart en millisecondes, décomposé comme sur un cadran. */
export function decomposer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    j: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

/**
 * Le décompte en toutes lettres courtes : « 1 j 22 h », « 3 h 05 min »,
 * « 07:42 ». La précision suit la distance — à trois jours, la seconde est du
 * bruit ; à trois minutes, c'est l'information.
 */
export function decompteCourt(ms: number): string {
  const { j, h, m, s } = decomposer(ms)
  if (j > 0) return `${j} j ${h} h`
  if (h > 0) return `${h} h ${deux(m)} min`
  return `${deux(m)}:${deux(s)}`
}

/** « dans 2 heures », « dans 3 jours » — pour une phrase, pas pour un compteur. */
export function dansCombien(ms: number): string {
  const { j, h, m } = decomposer(ms)
  if (j >= 2) return `dans ${j} jours`
  if (j === 1) return h >= 12 ? 'dans un jour et demi' : 'dans un jour'
  if (h >= 2) return `dans ${h} heures`
  if (h === 1) return 'dans une heure'
  if (m >= 2) return `dans ${m} minutes`
  return 'dans un instant'
}
