/**
 * Les regles du contrat, implementees UNE SEULE FOIS, du cote du contrat.
 *
 * Les trois lots obtiennent le meme resultat au lieu de reimplementer chacun sa
 * version de « 24 h avant ». Aucune constante metier n'est ecrite ici : tarifs,
 * plage horaire, blocages et reglages sont LUS dans `docs/CAHIER-API.md` a chaque
 * appel. Si le cahier change un prix, ce module change avec lui.
 *
 * Ce module ne connait aucune base. Il ne peut donc pas connaitre l'occupation
 * reelle d'un creneau : `taken` vaut TOUJOURS null, jamais un chiffre invente.
 */

import * as cahier from './cahier.mjs'
import * as horloge from './horloge.mjs'
import { enumeration } from './openapi.mjs'

// ---------------------------------------------------------------------------
// Tarif — CAHIER §3.4
// ---------------------------------------------------------------------------

/**
 * @param {number} heure heure de DEBUT du creneau, en heure murale Paris
 * @returns {{ trouve: boolean, kind?: string, amount_cents?: number, source?: string,
 *   heures_connues?: number[], message?: string }}
 */
export function tarifPourHeure(heure) {
  const grille = cahier.tarifs()
  if (!grille.length) {
    return {
      trouve: false,
      message:
        'ABSENT DU CONTRAT : le tableau des tarifs (§3.4) est introuvable dans docs/CAHIER-API.md. Ne pas inventer de prix : demander a Eddy.',
    }
  }
  const ligne = grille.find((t) => t.heures_debut.includes(Number(heure)))
  if (!ligne) {
    const connues = [...new Set(grille.flatMap((t) => t.heures_debut))].sort((a, b) => a - b)
    return {
      trouve: false,
      heures_connues: connues,
      message:
        `ABSENT DU CONTRAT : aucun tarif pour un creneau qui commence a ${heure} h. ` +
        `Heures tarifees dans docs/CAHIER-API.md §3.4 : ${connues.join(', ')}. ` +
        `Ne pas extrapoler : demander a Eddy.`,
    }
  }
  return {
    trouve: true,
    kind: ligne.kind,
    amount_cents: ligne.amount_cents,
    creneaux: ligne.creneaux,
    source: `${cahier.FICHIER} §3.4, ligne ${ligne.ligne}`,
  }
}

/** Grille tarifaire complete, telle qu'elle est ecrite. */
export function grilleTarifaire() {
  return cahier.tarifs()
}

// ---------------------------------------------------------------------------
// Creneaux — CAHIER §3.3, §3.2, §3.9
// ---------------------------------------------------------------------------

const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/**
 * Une journee de creneaux, calculee HORS BASE.
 *
 * `taken` est null sur toutes les lignes : ce module n'a pas de base, il ne peut
 * pas savoir combien de coachs ont reserve. Un outil qui renverrait `taken: 1`
 * serait exactement la maladie qu'on soigne. `state` ne vaut donc jamais `full`.
 *
 * @param {{ club: string, espace: string, date: string, maintenant?: Date }} args
 */
export function grilleDuJour({ club, espace, date, maintenant = new Date() }) {
  const structure = cahier.clubsEtEspaces()
  const types = cahier.creneauxTypes()
  const reglages = cahier.reglages()

  const ecarts = []
  if (!types || !types.plage) {
    return {
      erreur:
        'ABSENT DU CONTRAT : la plage des creneaux types (§3.3) est introuvable dans docs/CAHIER-API.md.',
    }
  }

  const clubConnu = structure.clubs.find((c) => c.club === club)
  if (!clubConnu) {
    return {
      erreur:
        `ABSENT DU CONTRAT : le club "${club}" n'existe pas. ` +
        `Clubs declares en §3.2 : ${structure.clubs.map((c) => c.club).join(', ')}.`,
    }
  }
  if (espace && !clubConnu.espaces.includes(espace)) {
    return {
      erreur:
        `ABSENT DU CONTRAT : l'espace "${espace}" n'existe pas pour le club "${club}". ` +
        `Espaces declares en §3.2 ligne ${clubConnu.ligne} : ${clubConnu.espaces.join(', ')}.`,
    }
  }

  const mDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim())
  if (!mDate) {
    return { erreur: 'VALIDATION : `date` doit etre au format YYYY-MM-DD (heure murale Paris).' }
  }
  const [, aa, mm, jj] = mDate.map(Number)

  const midi = horloge.instantParis(aa, mm, jj, 12).instant
  const jourSemaine = horloge.composantesParis(midi).jour_semaine

  // §3.3 : lun–sam. Le dimanche n'a pas de creneau type.
  const joursOuvres = /lun.*sam/i.test(types.jours_texte || '')
  if (joursOuvres && jourSemaine === 0) {
    return {
      club,
      espace: espace || null,
      date,
      jour: NOMS_JOURS[jourSemaine],
      creneaux: [],
      raison:
        `Aucun creneau : ${types.jours_texte} (${cahier.FICHIER} §3.3, ligne ${types.ligne_plage}). ` +
        `Le dimanche n'est pas un jour de creneau type.`,
      sources: sourcesGrille(types, structure, reglages),
      occupation: OCCUPATION_INCONNUE,
    }
  }

  const capacite = reglages.valeurs.capacity_per_slot ?? structure.capacite_defaut ?? null
  if (capacite == null) ecarts.push('capacity_per_slot introuvable en §3.9 et §3.2')

  // Blocages boxe educative. Le club « paramétrable BO » ne suit pas le defaut :
  // le dire, plutot que de repondre `blocked` ou `open` a sa place.
  const clubParametrable = types.club_exclu_du_defaut === club
  const blocageDuJour = types.blocages.find((b) => b.jour_iso === jourSemaine)

  const creneaux = []
  for (let h = types.plage.premiere_heure; h < types.plage.fin_derniere; h += 1) {
    const debut = horloge.instantParis(aa, mm, jj, h).instant
    const fin = horloge.instantParis(aa, mm, jj, h + 1).instant
    const t = tarifPourHeure(h)

    let etat = 'open'
    let raison = null

    if (debut.getTime() <= maintenant.getTime()) {
      etat = 'past'
      raison = 'le creneau a commence (comparaison a l\'heure serveur Europe/Paris)'
    } else if (blocageDuJour && blocageDuJour.heures_debut.includes(h)) {
      if (clubParametrable) {
        etat = 'open'
        raison =
          `blocage educative NON APPLIQUE par defaut a "${club}" : ${types.texte_exclusion} ` +
          `(${cahier.FICHIER} §3.3, ligne ${types.ligne_exclusion}). ` +
          `L'etat reel depend de coach_slot_blocks en base — inconnu hors base.`
      } else {
        etat = 'blocked'
        raison = `boxe educative par defaut : ${blocageDuJour.texte} (${cahier.FICHIER} §3.3, ligne ${blocageDuJour.ligne})`
      }
    }

    creneaux.push({
      starts_at: horloge.isoParis(debut),
      ends_at: horloge.isoParis(fin),
      tariff: t.trouve ? t.kind : null,
      amount_cents: t.trouve ? t.amount_cents : null,
      capacity: capacite,
      taken: null,
      state: etat,
      raison,
    })
  }

  return {
    club,
    espace: espace || null,
    date,
    jour: NOMS_JOURS[jourSemaine],
    creneaux,
    occupation: OCCUPATION_INCONNUE,
    ecarts,
    sources: sourcesGrille(types, structure, reglages),
  }
}

const OCCUPATION_INCONNUE =
  'taken = null sur toutes les lignes : ce serveur n\'a aucune base. ' +
  'L\'etat "full" n\'est jamais calculable ici — il vient de coach_reservations. ' +
  'Pour l\'occupation reelle, appeler GET /clubs/{club_id}/slots.'

function sourcesGrille(types, structure, reglages) {
  return [
    `${cahier.FICHIER} §3.3 ligne ${types.ligne_plage} (plage horaire)`,
    ...types.blocages.map((b) => `${cahier.FICHIER} §3.3 ligne ${b.ligne} (${b.jour})`),
    `${cahier.FICHIER} §3.2 ligne ${structure.ligne_capacite} (capacite par defaut)`,
    reglages.ligne ? `${cahier.FICHIER} §3.9 ligne ${reglages.ligne} (reglages direction)` : null,
    `${cahier.FICHIER} §3.4 (tarifs)`,
  ].filter(Boolean)
}

// ---------------------------------------------------------------------------
// Horloge de reservation — CAHIER §1.6, §2, §3.5, §3.9, §9
// ---------------------------------------------------------------------------

/**
 * Toutes les echeances d'une reservation, en ISO Europe/Paris avec decalage explicite.
 * @param {{ starts_at: string, held_at?: string }} args
 */
export function horlogeReservation({ starts_at, held_at }) {
  const debut = horloge.analyserInstant(starts_at)
  if (debut.erreur) return { erreur: `starts_at : ${debut.erreur}`, entree: starts_at }

  const reglages = cahier.reglages()
  const v = reglages.valeurs
  const manquants = ['hold_ttl_seconds', 'cancel_min_hours', 'qr_early_minutes'].filter(
    (k) => v[k] == null,
  )
  if (manquants.length) {
    return {
      erreur:
        `ABSENT DU CONTRAT : reglage(s) introuvable(s) en ${cahier.FICHIER} §3.9 : ${manquants.join(', ')}. ` +
        `Ne pas supposer une valeur : demander a Eddy.`,
    }
  }

  const c = horloge.composantesParis(debut.instant)
  const fin = horloge.instantParis(c.annee, c.mois, c.jour, c.heure + 1, c.minute).instant

  const pose = held_at ? horloge.analyserInstant(held_at) : null
  if (pose && pose.erreur) return { erreur: `held_at : ${pose.erreur}`, entree: held_at }

  const limiteAbsolue = horloge.plusMinutes(debut.instant, -v.cancel_min_hours * 60)
  const limiteCivile = horloge.moinsHeuresCiviles(debut.instant, v.cancel_min_hours)
  const divergence = limiteAbsolue.getTime() !== limiteCivile.getTime()

  return {
    entree: { starts_at, held_at: held_at || null },
    interpretation: debut.interpretation,
    fuseau: horloge.FUSEAU,
    starts_at: horloge.isoParis(debut.instant),
    ends_at: horloge.isoParis(fin),
    hold_expires_at: pose
      ? horloge.isoParis(horloge.plusMinutes(pose.instant, v.hold_ttl_seconds / 60))
      : null,
    hold_ttl_seconds: v.hold_ttl_seconds,
    annulation_limite: horloge.isoParis(limiteAbsolue),
    annulation_limite_civile: horloge.isoParis(limiteCivile),
    annulation_divergence_heure_dete: divergence,
    qr_nbf: horloge.isoParis(horloge.plusMinutes(debut.instant, -v.qr_early_minutes)),
    qr_exp: horloge.isoParis(fin),
    consumed_apres: horloge.isoParis(fin),
    avertissement: divergence
      ? `ARBITRAGE NON TRANCHE (spec 06 §11 Q7) : le cahier dit « moins de 24 h avant le creneau » ` +
        `sans dire si ce sont 24 h ABSOLUES (${horloge.isoParis(limiteAbsolue)}) ou 24 h CIVILES ` +
        `(${horloge.isoParis(limiteCivile)}). Le changement d'heure les separe d'une heure sur cette date. ` +
        `Les deux sont donnees : ne pas en choisir une sans l'accord d'Eddy.`
      : null,
    sources: [
      `${cahier.FICHIER} §3.9 ligne ${reglages.ligne} (hold_ttl_seconds, cancel_min_hours, qr_early_minutes)`,
      `${cahier.FICHIER} §1.6 (heure serveur Europe/Paris, jamais Date du navigateur)`,
      `${cahier.FICHIER} §9 (nbf = starts_at − ${v.qr_early_minutes} min, exp = ends_at)`,
      `${cahier.FICHIER} §2 (consumed pose par le cron quand le creneau est ecoule)`,
    ],
  }
}

/** Fenetre de validite du QR — CAHIER §9. */
export function fenetreQr({ starts_at, ends_at }) {
  const debut = horloge.analyserInstant(starts_at)
  if (debut.erreur) return { erreur: `starts_at : ${debut.erreur}` }

  const reglages = cahier.reglages()
  const avance = reglages.valeurs.qr_early_minutes
  if (avance == null) {
    return {
      erreur: `ABSENT DU CONTRAT : qr_early_minutes introuvable en ${cahier.FICHIER} §3.9.`,
    }
  }

  let finInstant
  if (ends_at) {
    const f = horloge.analyserInstant(ends_at)
    if (f.erreur) return { erreur: `ends_at : ${f.erreur}` }
    finInstant = f.instant
  } else {
    const c = horloge.composantesParis(debut.instant)
    finInstant = horloge.instantParis(c.annee, c.mois, c.jour, c.heure + 1, c.minute).instant
  }

  const champsQr = cahier
    .champsReservation()
    .filter((c) => c.champ === 'qr_valid_from' || c.champ === 'qr_valid_to')

  return {
    valid_from: horloge.isoParis(horloge.plusMinutes(debut.instant, -avance)),
    valid_to: horloge.isoParis(finInstant),
    qr_early_minutes: avance,
    etats: etatsQr(),
    ends_at_deduit: !ends_at,
    sources: [
      `${cahier.FICHIER} §9 (payload QR : nbf = starts_at − ${avance} min, exp = ends_at)`,
      ...champsQr.map((c) => `${cahier.FICHIER} §3.5 ligne ${c.ligne} (${c.champ} : ${c.notes})`),
      `${cahier.FICHIER} §3.9 ligne ${reglages.ligne} (qr_early_minutes)`,
    ],
  }
}

/** Les etats du QR, lus dans §9 du cahier. */
function etatsQr() {
  const s = cahier.corpsDeSection('9')
  if (!s) return []
  const lignes = s.corps.split(/\r?\n/)
  const i = lignes.findIndex((l) => /^`state`\s*:/.test(l.trim()))
  if (i < 0) return []
  return [...lignes[i].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).filter((x) => x !== 'state')
}

// ---------------------------------------------------------------------------
// Transitions d'etat — CAHIER §2, §6, §7, §8
//
// Chaque arete porte le MOTIF de la phrase du cahier qui l'etablit. Au moment de
// l'appel, on va rechercher cette phrase dans le fichier : si elle n'y est plus,
// l'arete est renvoyee avec `citation_introuvable`, et non comme un fait acquis.
// C'est la seule facon honnete de repondre sans analyser un diagramme ASCII dont
// l'alignement des fleches n'est pas un format.
// ---------------------------------------------------------------------------

const ARETES = [
  {
    de: 'held',
    vers: 'awaiting_signature',
    section: '7',
    motif: 'status=awaiting_signature',
    condition: 'paiement encaisse, constate par le webhook prestataire',
    event: 'reservation.paid',
  },
  {
    de: 'held',
    vers: 'expired',
    section: '6',
    motif: 'hold_expires_at',
    condition: 'hold_expires_at depasse, cron',
    event: null,
  },
  {
    de: 'held',
    vers: 'payment_failed',
    section: '7',
    motif: 'payment_failed',
    condition: 'paiement refuse par le prestataire ; la place est liberee',
    event: 'reservation.payment_failed',
  },
  {
    de: 'awaiting_signature',
    vers: 'confirmed',
    section: '8',
    motif: 'status=confirmed',
    condition:
      'tous les documents signes ET payment_status paid ou waived_credit (barriere §2)',
    event: 'reservation.confirmed',
  },
  {
    de: 'awaiting_signature',
    vers: 'cancelled_credit',
    section: '6',
    motif: 'cancelled_credit',
    condition: 'annulation par le proprietaire ou la direction, now < starts_at − 24 h',
    event: 'reservation.cancelled',
  },
  {
    de: 'confirmed',
    vers: 'cancelled_credit',
    section: '6',
    motif: 'cancelled_credit',
    condition: 'annulation par le proprietaire ou la direction, now < starts_at − 24 h',
    event: 'reservation.cancelled',
  },
  {
    de: 'confirmed',
    vers: 'consumed',
    section: '2',
    motif: 'consumed',
    condition: 'fin de creneau passee, cron',
    event: null,
  },
  {
    de: 'confirmed',
    vers: 'no_show',
    section: '2',
    motif: 'no_show',
    condition: 'marquage manuel direction',
    event: null,
  },
]

/** Cherche la phrase justificative dans une section du cahier. */
function citation(section, motif) {
  const s = cahier.corpsDeSection(section)
  if (!s) return null
  const lignes = s.corps.split(/\r?\n/)
  const i = lignes.findIndex((l) => l.includes(motif))
  if (i < 0) return null
  return { fichier: cahier.FICHIER, section, ligne: s.ligne + 1 + i, texte: lignes[i].trim() }
}

/**
 * @param {string} statut
 */
export function transitions(statut) {
  const connus = enumeration('ReservationStatus') || []
  const table = cahier.statuts()
  const regles = cahier.reglesDeStatut()
  const s = String(statut || '').trim()

  const dansEnum = connus.includes(s)
  const dansTable = table.find((t) => t.statut === s)

  if (!dansEnum && !dansTable) {
    return {
      trouve: false,
      statut: s,
      statuts_valides: connus,
      message:
        `ABSENT DU CONTRAT : "${s}" n'est ni dans l'enum ReservationStatus de docs/openapi.yaml ` +
        `ni dans le tableau §2 de docs/CAHIER-API.md. Statuts valides : ${connus.join(', ')}. ` +
        `Ne pas inventer : demander a Eddy.`,
    }
  }

  const avertissements = []
  if (!dansEnum && dansTable) {
    avertissements.push(
      `"${s}" figure dans la prose du cahier §2 (ligne ${dansTable.ligne} : « ${dansTable.signification} ») ` +
        `mais PAS dans l'enum ReservationStatus de docs/openapi.yaml. ` +
        `Ne jamais l'ecrire en base : le schema fait foi. Voir spec 06 §11 Q5.`,
    )
  }

  const atteignables = ARETES.filter((a) => a.de === s).map((a) => {
    const cit = citation(a.section, a.motif)
    const poseur = table.find((t) => t.statut === a.vers)
    return {
      vers: a.vers,
      qui_le_pose: poseur ? poseur.qui_le_pose : 'non precise par le cahier §2',
      condition: a.condition,
      event_emis: a.event,
      citation: cit,
      citation_introuvable: cit
        ? null
        : `La phrase attendue (§${a.section}, motif "${a.motif}") n'est plus dans ${cahier.FICHIER}. ` +
          `Le cahier a change : cette transition est a revalider avec Eddy avant de coder.`,
    }
  })

  /** Lacunes connues du contrat, a signaler plutot qu'a combler. */
  const lacunes = []
  if (s === 'held') {
    const cit = citation('6', 'libération, pas d’avoir') || citation('6', 'libération')
    lacunes.push({
      quoi: 'annulation d\'un hold',
      detail:
        'Le cahier §6 dit « Si `held` : liberation, pas d\'avoir » sans nommer le statut cible. ' +
        'Aucun statut de l\'enum ReservationStatus ne correspond a « annule sans avoir ». ' +
        'Ne pas inventer `cancelled` : demander a Eddy quel statut porter.',
      citation: cit,
    })
  }

  return {
    trouve: true,
    statut: s,
    dans_enum_openapi: dansEnum,
    signification: dansTable ? dansTable.signification : null,
    qui_le_pose: dansTable ? dansTable.qui_le_pose : null,
    atteignables,
    terminal: atteignables.length === 0,
    barriere: regles.barriere,
    ligne_barriere: regles.ligne_barriere,
    statuts_actifs: regles.actifs,
    texte_actifs: regles.texte_actifs,
    avertissements,
    lacunes,
    diagramme: regles.diagramme,
    sources: [
      `${cahier.FICHIER} §2 (machine a etats, ligne ${dansTable ? dansTable.ligne : '?'})`,
      'docs/openapi.yaml, schema ReservationStatus',
    ],
  }
}
