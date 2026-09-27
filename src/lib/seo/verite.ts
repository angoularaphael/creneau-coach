/**
 * LE REGISTRE DE VÉRITÉ — un fait, une source, une date, un seul endroit.
 *
 * Tout ce que le site affirme sur le monde extérieur vit ici : les adresses des
 * clubs, les textes de loi, les chiffres du marché. Chaque fait porte l'URL qui
 * le prouve et la date à laquelle quelqu'un l'a vérifié. Les pages, le JSON-LD,
 * `llms.txt` et les vignettes le PROJETTENT ; aucun d'eux ne le réécrit.
 *
 * ── POURQUOI UN REGISTRE ─────────────────────────────────────────────────
 *
 * Un moteur de réponse cite mot pour mot. Une adresse fausse sur une page
 * devient une adresse fausse dans la bouche de ChatGPT, et c'est un coach qui se
 * déplace pour rien. Écrire le même fait à quatre endroits, c'est garantir qu'un
 * jour trois d'entre eux auront été corrigés et pas le quatrième.
 *
 * ── LA DÉCISION D5, ET POURQUOI ELLE EST LEVÉE ───────────────────────────
 *
 * `.research/decisions.md` D5 interdisait de publier les adresses « parce
 * qu'aucune n'est confirmée ». Le 27 septembre 2026, les cinq ont été relevées
 * sur le site officiel du réseau (boxingcenter.fr, page de chaque salle et page
 * contact) et, pour quatre d'entre elles, recoupées sur le site propre du club.
 * La raison de D5 tombe ; son principe — rien qui ne soit vrai — est précisément
 * ce que ce fichier applique.
 *
 * Et la skill `aeo-geo` est formelle : un lieu sans adresse publiée n'existe
 * pour aucun moteur local. Ni ChatGPT (qui lit Bing), ni les AI Overviews (qui
 * lisent Google) ne recommandent une salle qu'ils ne savent pas situer.
 *
 * ── LA RÈGLE DE MAINTENANCE ──────────────────────────────────────────────
 *
 * Un fait sans source ne rentre pas. Un fait dont la source a changé se
 * re-vérifie ET change de date. Une affirmation de Boxing Center sur lui-même
 * (« la plus grande salle… ») est rangée comme telle et ne se publie jamais sans
 * son attribution.
 */

import type { ClubId } from '@/domain/contrat'

/** Date de la dernière vérification de l'ensemble du registre. */
export const REGISTRE_VERIFIE_LE = '2026-09-27'

export type Source = {
  readonly libelle: string
  readonly url: string
}

// ─────────────────────────────────────────────────────────────────────────────
// LES CLUBS
// ─────────────────────────────────────────────────────────────────────────────

export type ClubVerite = {
  readonly id: ClubId
  readonly nom: string
  readonly rue: string
  readonly codePostal: string
  readonly ville: string
  /** Une phrase d'accès, citée telle que le réseau la publie — jamais inventée. */
  readonly acces?: { readonly texte: string; readonly source: Source }
  /**
   * L'équipement, tel que la page officielle du club le décrit. `rings` est un
   * nombre parce qu'il sert à un calcul (le total du réseau) ; `citation` est
   * la phrase exacte, reprise pour qu'on puisse la vérifier en un clic.
   */
  readonly equipement: {
    readonly rings: number
    readonly resume: string
    readonly citation: string
  }
  readonly sources: readonly Source[]
  readonly verifieLe: string
}

const PAGE_SALLE = (chemin: string, club: string): Source => ({
  libelle: `Boxing Center — page officielle de la salle ${club}`,
  url: `https://boxingcenter.fr/salle-de-sport-toulouse/${chemin}/`,
})

export const CLUBS_VERITE: Readonly<Record<ClubId, ClubVerite>> = {
  minimes: {
    id: 'minimes',
    nom: 'Boxing Center Toulouse Minimes',
    rue: '12 rue de Fenouillet',
    codePostal: '31200',
    ville: 'Toulouse',
    acces: {
      texte: 'À 5 minutes du métro ligne B, station Barrière de Paris.',
      source: PAGE_SALLE('salle-de-boxe-toulouse-minimes', 'des Minimes'),
    },
    equipement: {
      rings: 3,
      resume: '3 rings et des sacs de frappe',
      citation:
        'Les sacs de frappe et les 3 rings pour la pratique de la boxe',
    },
    sources: [
      PAGE_SALLE('salle-de-boxe-toulouse-minimes', 'des Minimes'),
      { libelle: 'Boxing Center — page contact', url: 'https://boxingcenter.fr/contactez-le-boxing-center-toulouse/' },
    ],
    verifieLe: '2026-09-27',
  },
  'st-cyprien': {
    id: 'st-cyprien',
    nom: 'Boxing Center Toulouse Saint-Cyprien',
    rue: '11 rue Sainte-Lucie',
    codePostal: '31300',
    ville: 'Toulouse',
    equipement: {
      rings: 1,
      resume: 'un ring, des sacs de frappe et un espace de tatamis',
      citation:
        'Des sacs de frappe, un espace de tatamis et un ring pour la pratique de la boxe',
    },
    sources: [PAGE_SALLE('boxing-center-salle-de-toulouse-saint-cyprien', 'de Saint-Cyprien')],
    verifieLe: '2026-09-27',
  },
  'etats-unis': {
    id: 'etats-unis',
    nom: 'Boxing Center Toulouse États-Unis',
    rue: '388 avenue des États-Unis',
    codePostal: '31200',
    ville: 'Toulouse',
    equipement: {
      rings: 2,
      resume: '2 rings de compétition, une cage surélevée, 400 m² de tapis et 16 sacs de frappe',
      citation:
        'Cet espace comprend 2 rings de compétition et 400 m² de tapis d’entraînement.',
    },
    sources: [PAGE_SALLE('boxing-center-salle-de-toulouse-etats-unis', 'des États-Unis')],
    verifieLe: '2026-09-27',
  },
  ramonville: {
    id: 'ramonville',
    nom: 'Boxing Center Ramonville',
    rue: '33 rue des Ormes',
    codePostal: '31520',
    ville: 'Ramonville-Saint-Agne',
    equipement: {
      rings: 1,
      resume: 'un ring de boxe olympique et un octogone de 7 m',
      citation:
        'Équipée d’un octogone de 7m et d’un ring de boxe olympique',
    },
    sources: [PAGE_SALLE('salle-de-boxe-toulouse-ramonville', 'de Ramonville')],
    verifieLe: '2026-09-27',
  },
  portet: {
    id: 'portet',
    nom: 'Boxing Center Portet-sur-Garonne',
    rue: '61 route d’Espagne',
    codePostal: '31120',
    ville: 'Portet-sur-Garonne',
    equipement: {
      rings: 1,
      resume: 'une salle de boxe de 500 m², un ring olympique, des tatamis et 24 sacs de frappe',
      citation:
        'une salle de Boxe de 500m2 comprenant un ring olympique, des tatamis, des panneaux MMA et 24 sacs de frappe',
    },
    sources: [PAGE_SALLE('salle-de-boxe-portet-sur-garonne-2', 'de Portet-sur-Garonne')],
    verifieLe: '2026-09-27',
  },
}

export function adresseEnLigne(c: ClubVerite): string {
  return `${c.rue}, ${c.codePostal} ${c.ville}`
}

/**
 * Le nombre de rings du réseau, CALCULÉ à partir des cinq pages officielles.
 * Jamais écrit en dur : le jour où un club en ajoute un, le total suit.
 */
export const TOTAL_RINGS = Object.values(CLUBS_VERITE).reduce((n, c) => n + c.equipement.rings, 0)

// ─────────────────────────────────────────────────────────────────────────────
// LE RÉSEAU
// ─────────────────────────────────────────────────────────────────────────────

export const RESEAU = {
  /** Le numéro général du réseau — celui de l'organisation, pas une ligne de support. */
  telephone: {
    affiche: '09 39 03 67 48',
    e164: '+33939036748',
    source: {
      libelle: 'Boxing Center — page contact',
      url: 'https://boxingcenter.fr/contactez-le-boxing-center-toulouse/',
    },
  },
  siteOfficiel: { libelle: 'Boxing Center — site officiel du réseau', url: 'https://boxingcenter.fr/' },
  /**
   * UNE AFFIRMATION DU RÉSEAU SUR LUI-MÊME, pas un fait vérifié par nous.
   * Elle ne se publie qu'attribuée : « Boxing Center présente… ».
   */
  affirmationEtatsUnis: {
    texte: 'la plus grande salle de sports de combat de France',
    attribution: 'selon Boxing Center',
    source: { libelle: 'Boxing Center — site officiel', url: 'https://boxingcenter.fr/' },
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// LA LOI — ce qu'un coach indépendant doit savoir, avec le texte
// ─────────────────────────────────────────────────────────────────────────────

const LEGIFRANCE_CHAPITRE: Source = {
  libelle: 'Code du sport, articles L212-1 à L212-14 — Légifrance',
  url: 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006071318/LEGISCTA000006151564/',
}

export const LOI = {
  qualification: {
    article: 'L212-1',
    citation:
      'Seuls peuvent, contre rémunération, enseigner, animer ou encadrer une activité physique ou sportive […] les titulaires d’un diplôme, titre à finalité professionnelle ou certificat de qualification',
    source: LEGIFRANCE_CHAPITRE,
  },
  sanctionQualification: {
    article: 'L212-8',
    texte: 'un an d’emprisonnement et 15 000 euros d’amende',
    source: LEGIFRANCE_CHAPITRE,
  },
  declaration: {
    article: 'L212-11',
    texte:
      'Les personnes exerçant contre rémunération ces activités déclarent leur activité à l’autorité administrative.',
    source: LEGIFRANCE_CHAPITRE,
  },
  sanctionDeclaration: {
    article: 'L212-12',
    texte: 'un an d’emprisonnement et 15 000 euros d’amende',
    source: LEGIFRANCE_CHAPITRE,
  },
  /** Le registre public où n'importe qui vérifie une carte professionnelle. */
  registrePublic: {
    libelle: 'Rechercher un éducateur sportif — EAPS, ministère des Sports',
    url: 'https://eapspublic.sports.gouv.fr/CarteProRecherche/RechercherEducateurCartePro',
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// LE MARCHÉ — pourquoi ce service existe, chiffré
// ─────────────────────────────────────────────────────────────────────────────

const INJEP_BPJEPS: Source = {
  libelle:
    'INJEP, « Les diplômés 2022-2023 d’un BPJEPS », Philippe Lombardo, n° 2024/07, 7 novembre 2024',
  url: 'https://injep.fr/publication/les-diplomes-2022-2023-dun-brevet-professionnel-deducateur-sportif-ou-danimateur-bpjeps/',
}

export const MARCHE = {
  diplomesBpjeps: {
    valeur: 'près de 14 100',
    periode: 'entre mai 2022 et avril 2023',
    texte:
      'Près de 14 100 personnes ont obtenu un brevet professionnel d’éducateur sportif (BPJEPS) entre mai 2022 et avril 2023.',
    source: INJEP_BPJEPS,
  },
  mentionsForme: {
    texte:
      'Les deux mentions les plus fréquentes sont « activités de la forme » (26 %) et « activités physiques pour tous » (25 %).',
    source: INJEP_BPJEPS,
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// LA COMPARAISON — ce que font les autres, cité mot pour mot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une règle d'un tiers ne s'écrit que VERBATIM, attribuée et liée.
 *
 * Paraphraser le règlement d'une marque concurrente, c'est risquer de lui faire
 * dire ce qu'elle ne dit pas — et un moteur de réponse reprendrait la
 * paraphrase comme un fait. La recherche initiale prêtait aussi à Basic-Fit une
 * règle sur les coachs invités : elle ne figure PAS sur la page officielle
 * vérifiée, elle n'est donc pas ici.
 */
export const COMPARAISON = {
  basicFit: {
    marque: 'Basic-Fit',
    citation:
      'Les activités commerciales et/ou promotionnelles ou la fourniture de services d’entrainement personnel ne sont pas autorisées sans l’autorisation écrite préalable de Basic-Fit.',
    source: {
      libelle: 'Basic-Fit — règlement intérieur',
      url: 'https://www.basic-fit.com/fr-fr/a-propos-de-nous/reglement-interieur',
    },
    verifieLe: '2026-09-27',
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// L'ÉDITEUR — mentions légales (LCEN, art. 6-III-1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Relevé le 27/09/2026 sur la page « mentions légales » du site officiel du
 * réseau, et RECOUPÉ sur le registre public des entreprises de l'État : même
 * SIREN, même siège, société active, activité 93.12Z (clubs de sports).
 *
 * La page mentions-légales du site portait « placeholder Lot B » en clair. Une
 * obligation légale ne se laisse pas en brouillon sur une page publique.
 *
 * À CONFIRMER PAR EDDY : que le directeur de la publication de ce sous-domaine
 * est bien celui du site du réseau. C'est la même société, mais c'est une
 * décision de l'éditeur, pas une déduction.
 */
export const EDITEUR = {
  raisonSociale: 'SAS BOXING CENTER',
  capital: '1 500 €',
  siren: '821 817 889',
  rcs: 'RCS Toulouse B 821 817 889',
  siege: '12 rue de Fenouillet, 31200 Toulouse',
  email: 'boxingcenter31@gmail.com',
  directeurPublication: 'Sébastien Dutilh',
  sources: [
    { libelle: 'Boxing Center — mentions légales', url: 'https://boxingcenter.fr/mentions-legales/' },
    {
      libelle: 'Annuaire des entreprises (État) — SIREN 821 817 889',
      url: 'https://annuaire-entreprises.data.gouv.fr/entreprise/821817889',
    },
  ],
  hebergeur: {
    nom: 'Vercel Inc.',
    adresse: '440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis',
    source: { libelle: 'Vercel — politique de confidentialité', url: 'https://vercel.com/legal/privacy-policy' },
  },
  /** La base de données : Supabase, région AWS eu-central-1 (Francfort). Lu dans l'URL de connexion. */
  donnees: { nom: 'Supabase', region: 'Union européenne (Francfort, Allemagne)' },
} as const
