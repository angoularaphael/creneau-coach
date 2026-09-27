import 'server-only'

import { prixCourt } from '@/domain/contrat'
import { CLUBS_VERITE, EDITEUR, RESEAU, adresseEnLigne } from '@/lib/seo/verite'
import { createServiceClient } from '@/lib/supabase/service'

import { TITRES, type TypeDocument } from './obligatoires'
import { pdfJuridique } from './pdf-juridique'
import { CGV } from './textes/cgv'
import { DECHARGE } from './textes/decharge'
import { REGLEMENT } from './textes/reglement'

/**
 * Les documents à signer RÉDIGÉS DANS LE DÉPÔT — et la résolution de leurs
 * valeurs réglables au moment de la publication.
 *
 * Un contrat qui dit « 24 heures » alors que le moteur applique 48 est un
 * contrat faux. Les délais, prix, capacités et horaires sont donc lus dans les
 * réglages EN BASE (`coach_settings`, `coach_tariffs`, `coach_tariff_hours`,
 * créneaux actifs) à l'instant de la publication, et figés dans le PDF et dans
 * le texte enregistré. Si la direction change un réglage, elle republie.
 */

/** La version rédigée. À changer à chaque modification d'un texte source. */
export const VERSION_REDIGEE = '2026-09-27'
export const DATE_VERSION_REDIGEE = '27 septembre 2026'
/** Minuit, heure de Paris, le jour de la version — la date de création du PDF. */
export const CREATION_VERSION_REDIGEE = new Date('2026-09-27T00:00:00+02:00')

/**
 * L'adresse de la Plateforme écrite dans les contrats. Le domaine officiel,
 * décidé le 19/09/2026, et non `SITE_URL` : publiés depuis une prévisualisation
 * Vercel, les contrats porteraient une adresse de déploiement éphémère.
 */
export const ADRESSE_PLATEFORME = 'https://coachings.boxingcenter.fr'

export const SOURCES: Record<TypeDocument, string> = {
  cgv: CGV,
  reglement: REGLEMENT,
  decharge: DECHARGE,
}

const EN_LETTRES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt',
  'vingt et un', 'vingt-deux', 'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept',
  'vingt-huit', 'vingt-neuf', 'trente',
]

/** L'usage des contrats : « trois (3) ». Au-delà de trente, le chiffre seul. */
export function enToutesLettres(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < EN_LETTRES.length ? `${EN_LETTRES[n]} (${n})` : String(n)
}

/** [10, 11, 14, 15, 16] → « de 10 h à 12 h et de 14 h à 17 h ». */
export function plagesEnClair(heures: readonly number[]): string {
  const blocs: [number, number][] = []
  for (const h of [...new Set(heures)].sort((a, b) => a - b)) {
    const dernier = blocs.at(-1)
    if (dernier && dernier[1] === h) dernier[1] = h + 1
    else blocs.push([h, h + 1])
  }
  const textes = blocs.map(([a, b]) => `de ${a} h à ${b} h`)
  return textes.length > 1 ? `${textes.slice(0, -1).join(', ')} et ${textes.at(-1)}` : (textes[0] ?? '')
}

export type Valeurs = Readonly<Record<string, string>>

/** Toutes les valeurs des jetons, lues en base et dans le registre de vérité. */
export async function valeursEnVigueur(): Promise<Valeurs> {
  const sb = createServiceClient()
  const [reglages, tarifs, heuresTarif, gabarits, espaces] = await Promise.all([
    sb.from('coach_settings').select('key, value'),
    sb.from('coach_tariffs').select('kind, amount_cents'),
    sb.from('coach_tariff_hours').select('start_hour, kind'),
    sb.from('coach_slot_templates').select('start_hour').eq('is_active', true),
    sb.from('coach_spaces').select('club_id, id, name').eq('is_active', true).order('id'),
  ])
  for (const r of [reglages, tarifs, heuresTarif, gabarits, espaces]) {
    if (r.error) throw new Error(`réglages : ${r.error.message}`)
  }

  const reglage = (cle: string): number => {
    const ligne = (reglages.data ?? []).find((r) => r.key === cle)
    const v = Number(ligne?.value)
    if (!Number.isFinite(v)) throw new Error(`réglage absent ou illisible : ${cle}`)
    return v
  }
  const tarif = (kind: 'offpeak' | 'peak'): number => {
    const t = (tarifs.data ?? []).find((r) => r.kind === kind)
    if (!t) throw new Error(`tarif absent : ${kind}`)
    return Number(t.amount_cents)
  }

  // Les heures VENDUES : actives dans au moins un espace, classées par tarif.
  const actives = new Set((gabarits.data ?? []).map((g) => Number(g.start_hour)))
  const heuresDe = (kind: string) =>
    (heuresTarif.data ?? []).filter((h) => h.kind === kind && actives.has(Number(h.start_hour))).map((h) => Number(h.start_hour))

  const clubs = (Object.keys(CLUBS_VERITE) as (keyof typeof CLUBS_VERITE)[])
    .map((id) => {
      const v = CLUBS_VERITE[id]
      const noms = (espaces.data ?? []).filter((e) => e.club_id === id).map((e) => String(e.name))
      const libelle = noms.length > 1 ? `Espaces : ${noms.join(', ')}` : `Espace : ${noms[0] ?? 'Salle'}`
      return `- **${v.nom}**, ${adresseEnLigne(v)} — ${libelle}.`
    })
    .join('\n')

  const dureeOption = Math.round(reglage('hold_ttl_seconds') / 60)

  return {
    raison_sociale: EDITEUR.raisonSociale,
    capital: EDITEUR.capital,
    rcs: EDITEUR.rcs,
    siege: EDITEUR.siege,
    email: EDITEUR.email,
    telephone: RESEAU.telephone.affiche,
    site: ADRESSE_PLATEFORME,
    clubs,
    capacite: enToutesLettres(reglage('capacity_per_slot')),
    max_actives: enToutesLettres(reglage('max_active_reservations')),
    duree_option: `${enToutesLettres(dureeOption)} minutes`,
    delai_annulation: `${enToutesLettres(reglage('cancel_min_hours'))} heures`,
    avance_qr: `${enToutesLettres(reglage('qr_early_minutes'))} minutes`,
    prix_creux: prixCourt(tarif('offpeak')),
    prix_plein: prixCourt(tarif('peak')),
    plages_creuses: plagesEnClair(heuresDe('offpeak')),
    plages_pleines: plagesEnClair(heuresDe('peak')),
  }
}

/**
 * Remplace les jetons. Un jeton inconnu ou une valeur vide est une ERREUR, pas
 * un blanc : un contrat publié avec « {{prix_plein}} » ou « au plus  Coachs »
 * serait pire que pas de contrat.
 */
export function resoudre(source: string, valeurs: Valeurs): string {
  const texte = source.replace(/\{\{([a-z_]+)\}\}/g, (_, cle: string) => {
    const v = valeurs[cle]
    if (v === undefined || v.trim() === '') throw new Error(`valeur manquante pour {{${cle}}}`)
    return v
  })
  if (/\{\{|\}\}/.test(texte)) throw new Error('jeton mal formé dans le texte source')
  return texte.trim() + '\n'
}

export async function texteRedige(type: TypeDocument): Promise<string> {
  return resoudre(SOURCES[type], await valeursEnVigueur())
}

/** Le texte rédigé d'un type, résolu, et son PDF — ce que publie le back-office. */
export async function documentRedige(
  type: TypeDocument,
  valeurs?: Valeurs,
): Promise<{ readonly texte: string; readonly pdf: Buffer }> {
  const texte = resoudre(SOURCES[type], valeurs ?? (await valeursEnVigueur()))
  const pdf = await pdfJuridique({
    titre: TITRES[type],
    version: VERSION_REDIGEE,
    dateVersion: DATE_VERSION_REDIGEE,
    dateCreation: CREATION_VERSION_REDIGEE,
    texte,
  })
  return { texte, pdf }
}
