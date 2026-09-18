/**
 * Horloge Europe/Paris — LOT C.
 *
 * Ce module ne fait QUE deux choses : lire l'heure murale de Paris à un instant
 * donné, et la remettre en forme pour l'affichage. Il ne produit jamais l'instant
 * lui-même : `now()` vient de PostgreSQL, à chaque requête, et traverse le moteur
 * en paramètre (CAHIER §1.6). Aucun `Date.now()` n'a le droit d'exister ici.
 *
 * L'ARITHMÉTIQUE DE FUSEAU EST EN SQL, PAS ICI.
 * La grille réellement servie est produite par
 * `generate_series(…, interval '1 day', 'Europe/Paris')`, qui absorbe la bascule
 * heure d'été / heure d'hiver. Ce module en est le miroir pur, pour que le tarif,
 * le blocage et l'état soient testables en millisecondes et sans base.
 *
 * Interdits nommément (spec 03 §1.4) :
 *   - `for (let t = debut; t <= fin; t += 86_400_000)` sur des INSTANTS ;
 *   - `new Date().getHours()` : l'heure du conteneur n'est pas contractuelle ;
 *   - toute dépendance de dates. `Intl` suffit et est stable partout (Node 22,
 *     runtime Edge, navigateur).
 *
 * Note d'outillage, une fois pour toutes dans ce lot :
 * Node 22.17 charge ces fichiers via `--experimental-strip-types` et exige que
 * le spécificateur porte l'extension réelle (`./contrat.ts`) — vérifié : un
 * import en `./contrat.js` échoue avec ERR_MODULE_NOT_FOUND. TypeScript, lui,
 * refuse cette extension tant que `allowImportingTsExtensions` n'est pas activé
 * dans `tsconfig.json`, qui n'appartient pas à ce lot. Le `@ts-expect-error`
 * ci-dessous supprime exactement cette erreur-là (TS5097) et rien d'autre : les
 * types de `contrat.ts` continuent d'être vérifiés à travers lui (prouvé en
 * introduisant volontairement une erreur de type, qui a bien été signalée).
 */

// @ts-expect-error TS5097 -- Node exige l'extension .ts, tsconfig ne l'autorise pas encore.
import { FUSEAU_METIER } from './contrat.ts'

export const FUSEAU = FUSEAU_METIER

/**
 * `hour12: false` force `hourCycle: 'h23'` (MDN, page DateTimeFormat) : minuit
 * rend « 00 » et jamais « 24 ». Le `% 24` plus bas reste une ceinture pour les
 * vieilles ICU, pas une superstition — il ne coûte rien.
 */
const FORMAT_PARTIES = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hour12: false,
})

const JOURS_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

export interface PartiesParis {
  /** Date civile telle qu'elle s'affiche à Paris. */
  annee: number
  mois: number
  jour: number
  /** Heure murale Paris. */
  heure: number
  minute: number
  seconde: number
  /** 1 = lundi … 7 = dimanche. Même convention que `EXTRACT(ISODOW …)`. */
  isodow: number
  /** 'YYYY-MM-DD' — la clé de regroupement par journée Paris. */
  ymd: string
}

/** Instant (epoch ms) → heure murale Paris. Pur, sans effet de bord. */
export function partiesParis(ms: number): PartiesParis {
  const brut: Record<string, string> = {}
  for (const { type, value } of FORMAT_PARTIES.formatToParts(new Date(ms))) {
    if (type !== 'literal') brut[type] = value
  }
  const annee = Number(brut.year)
  const mois = Number(brut.month)
  const jour = Number(brut.day)
  const heure = Number(brut.hour) % 24
  const codeJour = brut.weekday ?? ''
  const isodow = JOURS_ISO[codeJour]
  if (isodow === undefined) {
    throw new Error(`horloge: jour de semaine illisible (${codeJour})`)
  }
  return {
    annee,
    mois,
    jour,
    heure,
    minute: Number(brut.minute),
    seconde: Number(brut.second),
    isodow,
    ymd: `${brut.year}-${brut.month}-${brut.day}`,
  }
}

/**
 * Décalage Paris↔UTC à cet instant, en millisecondes.
 * +3 600 000 l'hiver (CET), +7 200 000 l'été (CEST).
 */
export function decalageParisMs(ms: number): number {
  const p = partiesParis(ms)
  return Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde) - ms
}

function deuxChiffres(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Offset canonique d'un instant, au format ISO : '+02:00' ou '+01:00'. */
export function offsetParisIso(ms: number): string {
  const decalage = decalageParisMs(ms)
  const signe = decalage < 0 ? '-' : '+'
  const total = Math.abs(decalage) / 60_000
  const heures = Math.floor(total / 60)
  const minutes = Math.round(total % 60)
  return `${signe}${deuxChiffres(heures)}:${deuxChiffres(minutes)}`
}

/** Raison renvoyée par l'API quand l'heure murale demandée n'existe pas (spec §1.3). */
export const RAISON_HEURE_INEXISTANTE = 'nonexistent_local_time'

export type ResultatMur =
  /** Une seule lecture possible : le cas de 363 jours sur 365. */
  | { genre: 'exact'; ms: number }
  /** Heure vécue deux fois (dernier dimanche d'octobre). On retient la PREMIÈRE (CEST). */
  | { genre: 'ambigu'; ms: number; aussiMs: number }
  /** Heure qui n'existe pas (dernier dimanche de mars). `ms` est l'instant d'après le saut. */
  | { genre: 'inexistant'; ms: number }

/**
 * Heure murale Paris → instant. Deux passes, puis vérification par aller-retour.
 *
 * Le moteur n'appelle JAMAIS ceci pour fabriquer un créneau servi en production :
 * la grille vient de PostgreSQL. C'est l'outil des tests, de la validation
 * d'entrée (Q9 : l'offset envoyé doit être celui de Paris à cet instant) et du
 * back-office.
 *
 * La seconde passe suffit pour Europe/Paris : l'erreur de la première passe vaut
 * au plus une heure, et l'offset lu en `naif - decalage(naif)` est alors le bon
 * partout sauf dans le trou de printemps, que l'aller-retour attrape.
 */
export function instantDepuisParis(
  annee: number,
  mois: number,
  jour: number,
  heure: number,
  minute = 0,
  seconde = 0,
): ResultatMur {
  const naif = Date.UTC(annee, mois - 1, jour, heure, minute, seconde)
  let t = naif - decalageParisMs(naif)
  t = naif - decalageParisMs(t)

  const memeMur = (candidat: number): boolean => {
    const p = partiesParis(candidat)
    return (
      p.annee === annee &&
      p.mois === mois &&
      p.jour === jour &&
      p.heure === heure &&
      p.minute === minute &&
      p.seconde === seconde
    )
  }

  if (!memeMur(t)) return { genre: 'inexistant', ms: t }

  const uneHeureAvant = t - 3_600_000
  if (memeMur(uneHeureAvant)) {
    return { genre: 'ambigu', ms: uneHeureAvant, aussiMs: t }
  }
  return { genre: 'exact', ms: t }
}

/**
 * Comme `instantDepuisParis`, mais pour les appelants qui n'ont rien à faire
 * d'une heure ambiguë ou inexistante : rend l'instant, ou `null`.
 */
export function instantParisOuNull(
  annee: number,
  mois: number,
  jour: number,
  heure: number,
  minute = 0,
  seconde = 0,
): number | null {
  const r = instantDepuisParis(annee, mois, jour, heure, minute, seconde)
  return r.genre === 'inexistant' ? null : r.ms
}

/**
 * Instant → ISO 8601 portant l'offset réel de Paris : '2026-09-21T10:00:00+02:00'.
 *
 * Jamais d'heure nue dans un export ou une réponse : le 25 octobre 2026 à 02:30,
 * « 02:30 » désigne deux instants distincts. L'offset lève l'ambiguïté (spec §1.3).
 * Les millisecondes sont tronquées : ce format sert les créneaux et l'affichage,
 * pas l'horodatage fin, qui reste rendu par la base.
 */
export function isoParis(ms: number): string {
  const p = partiesParis(ms)
  const temps = `${deuxChiffres(p.heure)}:${deuxChiffres(p.minute)}:${deuxChiffres(p.seconde)}`
  return `${p.ymd}T${temps}${offsetParisIso(ms)}`
}

/** Journée civile Paris d'un instant : 'YYYY-MM-DD'. Bucket de la grille. */
export function jourParis(ms: number): string {
  return partiesParis(ms).ymd
}

export interface JourCivil {
  annee: number
  mois: number
  jour: number
}

/** 'YYYY-MM-DD' → parties. Refuse tout ce qui n'est pas exactement cette forme. */
export function analyserJourCivil(ymd: string): JourCivil | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const annee = Number(m[1])
  const mois = Number(m[2])
  const jour = Number(m[3])
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null
  // Rejette le 31 novembre et le 29 février d'une année commune.
  const controle = new Date(Date.UTC(annee, mois - 1, jour))
  if (
    controle.getUTCFullYear() !== annee ||
    controle.getUTCMonth() !== mois - 1 ||
    controle.getUTCDate() !== jour
  ) {
    return null
  }
  return { annee, mois, jour }
}

export function formaterJourCivil(j: JourCivil): string {
  return `${j.annee}-${deuxChiffres(j.mois)}-${deuxChiffres(j.jour)}`
}

/**
 * Liste des journées civiles Paris de `du` à `au`, bornes incluses.
 *
 * L'itération se fait sur le CALENDRIER, jamais sur des instants : on avance
 * d'un jour dans un `Date.UTC` qui ne connaît aucune bascule, puis on relit la
 * date civile. C'est précisément ce qui distingue cette boucle du `t += 86_400_000`
 * interdit en §1.4 : ici 86 400 000 ms séparent bien deux minuits UTC, toujours.
 */
export function joursCivils(du: string, au: string, maxJours = 400): string[] {
  const debut = analyserJourCivil(du)
  const fin = analyserJourCivil(au)
  if (!debut || !fin) throw new Error(`horloge: intervalle de jours invalide (${du} → ${au})`)

  let curseur = Date.UTC(debut.annee, debut.mois - 1, debut.jour)
  const borne = Date.UTC(fin.annee, fin.mois - 1, fin.jour)
  const jours: string[] = []
  while (curseur <= borne) {
    const d = new Date(curseur)
    jours.push(
      formaterJourCivil({
        annee: d.getUTCFullYear(),
        mois: d.getUTCMonth() + 1,
        jour: d.getUTCDate(),
      }),
    )
    if (jours.length > maxJours) {
      throw new Error(`horloge: intervalle trop large (> ${maxJours} jours)`)
    }
    curseur += 86_400_000
  }
  return jours
}

/**
 * ISO reçu d'un client → instant, avec contrôle STRICT de l'offset (spec §8-Q9).
 *
 * `2026-09-22T11:00:00Z` et `2026-09-22T13:00:00+02:00` désignent le même
 * instant, mais le premier laisserait croire à Brad qu'il affiche « 11 h » alors
 * que le coach doit venir à 13 h. On exige donc l'offset de Paris, et on répond
 * toujours dans la forme canonique produite par `isoParis()`.
 */
export function analyserInstantParis(
  iso: string,
): { ok: true; ms: number } | { ok: false; raison: 'format' | 'offset' } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(iso)
  if (!m) return { ok: false, raison: 'format' }
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return { ok: false, raison: 'format' }
  const offsetRecu = m[7] === 'Z' ? '+00:00' : (m[7] ?? '')
  if (offsetRecu !== offsetParisIso(ms)) return { ok: false, raison: 'offset' }
  return { ok: true, ms }
}

const FORMAT_JOUR_LONG = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** « lundi 21 septembre 2026 ». Affichage seulement — jamais une clé. */
export function formaterJourLong(ms: number): string {
  return FORMAT_JOUR_LONG.format(new Date(ms))
}

/** « 10:00 ». Affichage seulement. */
export function formaterHeure(ms: number): string {
  return FORMAT_HEURE.format(new Date(ms))
}

/** « 10:00 – 11:00 », pour une carte de créneau. */
export function formaterPlage(debutMs: number, finMs: number): string {
  return `${formaterHeure(debutMs)} – ${formaterHeure(finMs)}`
}
