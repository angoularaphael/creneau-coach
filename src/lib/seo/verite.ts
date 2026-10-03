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

import {
  DERNIERE_HEURE_DEBUT,
  HEURES_CREUSES,
  HEURES_PLEINES,
  PREMIERE_HEURE,
  REGLAGES_DEFAUT,
  prixCourt,
  type ClubId,
} from '@/domain/contrat'

/**
 * Date de la dernière vérification des faits EXTÉRIEURS (adresses, loi, marché).
 * Elle ne bouge que le jour où quelqu'un rouvre réellement les sources : une
 * date avancée sans relecture serait une fausse fraîcheur, et la skill
 * `aeo-geo` la classe parmi ce qui coûte plus cher qu'une date absente.
 */
export const REGISTRE_VERIFIE_LE = '2026-09-27'

/** Date de la relecture des règles du service contre le texte servi des CG et du RI. */
export const REGLES_VERIFIEES_LE = '2026-10-02'

/**
 * Une source : une URL absolue (un tiers) OU un chemin du site commençant par
 * « / » (nos propres documents contractuels, ancrés sur l'article). Le
 * composant `Sources` ouvre les premières dans un nouvel onglet et garde les
 * secondes dans le site.
 */
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
// L'OFFRE — les règles du service, telles que les documents signés les écrivent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POURQUOI LES RÈGLES DU SERVICE VIVENT ICI, ET PAS DANS CHAQUE PAGE
 *
 * Le 02/10/2026, la relecture des pages a trouvé quatre phrases fausses, toutes
 * écrites à la main, toutes démenties par le contrat que le coach signe :
 *
 *   · « Vous signez une fois pour toutes » — les documents se signent après
 *     CHAQUE paiement (CG art. 9.1 ; la réservation passe par « à signer »
 *     avant d'être confirmée, `src/lib/dal/paiements.ts`) ;
 *   · « l'avoir se déduit » / « couvre les deux tiers d'une heure pleine » —
 *     un avoir paie une réservation ENTIÈRE et ne se combine pas avec la
 *     carte (CG art. 10.5, `src/domain/avoirs.ts`) ;
 *   · « rien à ranger » — le règlement exige de remettre l'équipement en place
 *     (RI art. 4.4) ;
 *   · « Serai-je seul ? Deux coachs au plus » — l'espace est aussi partagé avec
 *     les adhérents et le personnel du club (CG art. 3.3).
 *
 * Un moteur de réponse cite mot pour mot : chacune de ces phrases serait
 * devenue la réponse de ChatGPT, et un coach aurait signé un contrat qui la
 * contredit. Désormais chaque règle s'écrit UNE fois, ici, avec l'article qui la
 * fonde ; ses chiffres sont lus dans `REGLAGES_DEFAUT`, le même objet que le
 * moteur. Les pages, `llms.txt` et les vignettes la projettent.
 *
 * Les documents sont NOS textes : ils se citent par leur ancre (`#article-N`,
 * posée par `DocumentJuridique`), pas par un lien sortant. Un article cité
 * s'ouvre au bon endroit, et l'affirmation se vérifie en un clic.
 */
const CG = (article: number, objet: string): Source => ({
  libelle: `Conditions générales, article ${article} — ${objet}`,
  url: `/conditions-generales#article-${article}`,
})
const RI = (article: number, objet: string): Source => ({
  libelle: `Règlement intérieur des clubs, article ${article} — ${objet}`,
  url: `/reglement-interieur#article-${article}`,
})

/** Le planning en direct : c'est lui qui prouve une heure libre ou un cours. */
const PLANNING_EN_DIRECT: Source = {
  libelle: 'Le planning en direct des cinq clubs',
  url: '/clubs',
}

/**
 * Regroupe des heures de début qui se suivent : [10, 11, 14, 15, 16] →
 * « 10 h-12 h et 14 h-17 h ». Une seule fonction pour tout le site : la grille
 * affichée par /tarifs, /location-…, `llms.txt` et les FAQ ne peut plus
 * diverger de `HEURES_CREUSES`.
 */
export function plagesHoraires(heures: readonly number[]): string {
  const blocs: [number, number][] = []
  for (const h of [...heures].sort((a, b) => a - b)) {
    const dernier = blocs[blocs.length - 1]
    if (dernier && dernier[1] === h) dernier[1] = h + 1
    else blocs.push([h, h + 1])
  }
  return blocs.map(([a, b]) => `${a} h-${b} h`).join(' et ')
}

const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)
const finDeJournee = DERNIERE_HEURE_DEBUT + 1

export type Regle = { readonly texte: string; readonly source: Source }

/**
 * Chaque règle est une phrase AUTONOME — elle se lit et se cite sans le reste
 * de la page — et porte l'article qui la fonde.
 *
 * LES HEURES DU SOIR NE SONT PAS ICI, ET C'EST VOULU. La base accepte des
 * créneaux jusqu'à 21 h (migration 0023) mais les tient hors vente (0025) :
 * Eddy, 27/09/2026 — ne pas annoncer 19 h-21 h tant qu'il ne le demande pas.
 * L'amplitude publiée est celle du contrat : `PREMIERE_HEURE` → fin du
 * créneau de `DERNIERE_HEURE_DEBUT`.
 */
export const REGLES = {
  grille: {
    texte: `Les créneaux durent une heure et se réservent du lundi au samedi, de ${PREMIERE_HEURE} h à ${finDeJournee} h.`,
    source: PLANNING_EN_DIRECT,
  },
  coursDuClub: {
    texte:
      'Les heures où le club donne un cours — boxe anglaise, MMA, boxe éducative… — suivent le planning réel de chaque salle : elles s’affichent « Cours du club » et ne se réservent pas. Toutes les autres se réservent, y compris pendant l’accès libre des adhérents.',
    source: PLANNING_EN_DIRECT,
  },
  prix: {
    texte: `Une heure coûte ${creuse} en heure creuse (${plagesHoraires(HEURES_CREUSES)}) et ${pleine} en heure pleine (${plagesHoraires(HEURES_PLEINES)}), toutes taxes comprises, dans les cinq clubs et pour tous les espaces.`,
    source: CG(7, 'prix et paiement'),
  },
  prixFige: {
    texte:
      'Le prix affiché au moment de réserver est celui que vous payez : il ne change plus pour cette réservation, même si la grille évolue ensuite.',
    source: CG(7, 'prix et paiement'),
  },
  paiement: {
    texte:
      'L’heure se paie en une fois, au moment de la réservation, par carte bancaire ou avec un avoir qui en couvre tout le prix.',
    source: CG(7, 'prix et paiement'),
  },
  option: {
    texte: `Pendant le paiement, la place vous est gardée ${REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes ; sans paiement, elle se libère d’elle-même, sans frais.`,
    source: CG(6, 'réservation'),
  },
  limite: {
    texte: `Un coach tient au plus ${REGLAGES_DEFAUT.max_active_reservations} réservations en cours à la fois ; une place se libère dès qu’une séance est passée.`,
    source: CG(6, 'réservation'),
  },
  unClient: {
    texte:
      'Chaque réservation couvre un seul client, en cours privé. Le client est majeur ; un mineur n’est accueilli qu’avec l’accord écrit préalable de Boxing Center et l’autorisation écrite de son représentant légal.',
    source: CG(6, 'réservation'),
  },
  partage: {
    texte: `Un espace n’est jamais privatisé : au plus ${REGLAGES_DEFAUT.capacity_per_slot} coachs le réservent à la même heure, et il reste partagé avec les adhérents et le personnel du club.`,
    source: CG(3, 'clubs et espaces'),
  },
  signature: {
    texte:
      'Après chaque paiement, vous signez à l’écran les conditions générales, le règlement intérieur et la décharge de responsabilité en vigueur ; votre QR code d’accès est délivré dès la signature.',
    source: CG(9, 'signature électronique'),
  },
  attestation: {
    texte:
      'Chaque signature produit une attestation, téléchargeable depuis votre espace coach.',
    source: CG(9, 'signature électronique'),
  },
  sansSignature: {
    texte:
      'Sans signature avant le début du créneau, le QR code n’est pas délivré et l’heure reste due.',
    source: CG(9, 'signature électronique'),
  },
  qr: {
    texte: `Le QR code d’accès est nominatif, actif ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau jusqu’à sa fin, valable dans le seul club réservé, et ne sert qu’une fois.`,
    source: CG(8, 'accès au club'),
  },
  retard: {
    texte:
      'Le créneau commence et finit aux heures réservées : un retard ne le prolonge pas et ne donne droit ni à réduction ni à avoir, et l’espace se libère à l’heure de fin.',
    source: CG(8, 'accès au club'),
  },
  qrPersonnel: {
    texte:
      'Le QR code est attaché au compte du coach, qui entre avec son client ; le prêter, le céder ou le copier au profit d’un tiers est un manquement grave, qui peut entraîner la suspension immédiate du compte.',
    source: CG(8, 'accès au club'),
  },
  accesImpossible: {
    texte:
      'Si la porte ne s’ouvre pas pour une raison qui ne vient pas de vous, signalez-le tout de suite au personnel du club ou à Boxing Center, au plus tard 24 heures après la fin du créneau : vous recevez, à votre choix, un avoir ou le remboursement.',
    source: CG(8, 'accès au club'),
  },
  annulation: {
    texte: `Jusqu’à ${REGLAGES_DEFAUT.cancel_min_hours} heures avant le début du créneau, l’annulation se fait depuis votre espace et vous rend un avoir égal au prix payé ; passé ce délai, l’heure reste due.`,
    source: CG(10, 'annulation par le coach'),
  },
  absence: {
    texte:
      'Une absence, du coach comme de son client, vaut une heure due, sans avoir.',
    source: CG(10, 'annulation par le coach'),
  },
  avoir: {
    texte:
      'Un avoir est valable sans limite de durée, sauf durée différente indiquée au moment où il est émis, dans tous les clubs et tous les espaces. Il paie une réservation entière ; s’il dépasse le prix, le solde reste sur votre compte. Il ne se combine pas avec un paiement par carte.',
    source: CG(10, 'annulation par le coach'),
  },
  annulationParLeClub: {
    texte:
      'Si Boxing Center ne peut pas fournir un créneau réservé, vous choisissez entre un avoir et le remboursement intégral, versé sous 14 jours.',
    source: CG(11, 'modification ou annulation par Boxing Center'),
  },
  suspension: {
    texte:
      'Pendant une suspension de compte, le coach ne peut plus réserver ; ses réservations à venir sont annulées et leur prix devient un avoir, utilisable à la levée de la suspension.',
    source: CG(13, 'suspension et résiliation'),
  },
  securite: {
    texte:
      'Pendant le créneau, le coach assure seul l’organisation, le contenu, l’encadrement et la sécurité de la séance : il adapte les exercices au niveau, à l’âge et à l’état de santé de son client, et ne le laisse jamais sans surveillance.',
    source: CG(12, 'obligations et responsabilités'),
  },
  assuranceClient: {
    texte:
      'Le coach informe son client qu’il pratique sous la responsabilité du coach, et l’invite à souscrire une assurance individuelle couvrant les dommages corporels liés à la pratique.',
    source: CG(12, 'obligations et responsabilités'),
  },
  inscription: {
    texte:
      'L’ouverture d’un compte coach est gratuite. Elle est réservée aux personnes majeures qui exercent l’encadrement sportif à titre professionnel.',
    source: CG(4, 'le compte'),
  },
  qualification: {
    texte:
      'Le coach garantit être diplômé pour les disciplines qu’il enseigne, avoir déclaré son activité et détenir une carte professionnelle valide, exercer sous un numéro SIREN, et être assuré en responsabilité civile professionnelle.',
    source: CG(5, 'qualification et statut du coach'),
  },
  justificatifs: {
    texte:
      'Boxing Center peut demander la copie du diplôme, de la carte professionnelle, de l’attestation d’assurance et de l’avis d’immatriculation, à fournir sous huit jours.',
    source: CG(5, 'qualification et statut du coach'),
  },
  independance: {
    texte:
      'Le coach choisit librement ses clients, ses méthodes, ses horaires et ses tarifs, et facture lui-même ses séances. Boxing Center ne perçoit rien sur ce qu’il facture à ses clients.',
    source: CG(5, 'qualification et statut du coach'),
  },
  marque: {
    texte:
      'Le coach peut indiquer, de manière exacte, le club où il réserve ses créneaux ; utiliser le nom ou le logo Boxing Center demande un accord écrit.',
    source: CG(5, 'qualification et statut du coach'),
  },
  equipement: {
    texte:
      'Le coach et son client apportent leur équipement individuel — gants, bandes, protège-dents, protections, corde, serviette — et remettent en place l’équipement du club après usage.',
    source: RI(4, 'sécurité de la pratique'),
  },
  opposition: {
    texte:
      'Les mises de gants et le travail en opposition se pratiquent à intensité maîtrisée, avec gants et bandes, protège-dents et, en boxe, casque ; le combat à pleine puissance est interdit.',
    source: RI(4, 'sécurité de la pratique'),
  },
  chaussures: {
    texte:
      'Des chaussures de sport propres, réservées à l’intérieur, sont obligatoires hors des tatamis, rings, cages et octogones ; les chaussures de ville sont interdites sur les surfaces d’entraînement.',
    source: RI(6, 'tenue et hygiène'),
  },
} as const satisfies Record<string, Regle>

/**
 * Les cinq garanties de l'article 5.1 des CG, une par ligne, dans l'ordre du
 * contrat. `REGLES.qualification` les résume en une phrase ; cette liste les
 * détaille pour la page « devenir coach partenaire ». Les deux disent la même
 * chose parce qu'elles lisent le même article — et ce n'est écrit qu'ici.
 */
export const GARANTIES_DU_COACH: { readonly source: Source; readonly items: readonly { titre: string; texte: string }[] } = {
  source: CG(5, 'qualification et statut du coach'),
  items: [
    {
      titre: 'Diplômé pour ce que vous enseignez',
      texte: 'Un diplôme, un titre à finalité professionnelle ou un certificat de qualification pour chaque discipline enseignée (Code du sport, article L212-1).',
    },
    {
      titre: 'Déclaré, avec une carte professionnelle valide',
      texte: 'L’activité déclarée à l’autorité administrative (Code du sport, article L212-11) et une carte professionnelle d’éducateur sportif en cours de validité.',
    },
    {
      titre: 'Libre d’exercer',
      texte: 'Aucune des incapacités de l’article L212-9 du Code du sport, aucune interdiction d’exercer.',
    },
    {
      titre: 'Immatriculé',
      texte: 'Une activité exercée de manière déclarée, sous un numéro SIREN valide, à jour de ses obligations sociales et fiscales.',
    },
    {
      titre: 'Assuré en responsabilité civile professionnelle',
      texte: 'Une assurance qui couvre votre activité d’encadrement et les dommages que vous pourriez causer à votre client, aux tiers, aux locaux et aux équipements du club.',
    },
  ],
}

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
