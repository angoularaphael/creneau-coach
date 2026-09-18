/**
 * Famille MOTEUR — calculer sans base.
 *
 * Ces outils implementent les regles UNE SEULE FOIS, du cote du contrat, pour que
 * les trois lots obtiennent le meme resultat au lieu de reimplementer chacun sa
 * version de « 24 h avant ».
 *
 * Aucun de ces outils n'a de base. `grille_creneaux` renvoie donc `taken: null`
 * sur toutes les lignes et ne dit JAMAIS `full`.
 */

import { z } from 'zod'

import * as cahier from '../lib/cahier.mjs'
import * as horloge from '../lib/horloge.mjs'
import * as moteur from '../lib/moteur.mjs'
import { ANNOTATIONS, absent, invalide, json, structure, tableauTexte, texte } from './commun.mjs'

// ---------------------------------------------------------------------------
// 10 — tarif
// ---------------------------------------------------------------------------

const tarif = {
  nom: 'tarif',
  config: {
    title: 'Tarif contractuel d\'un creneau',
    description:
      "Le prix d'un creneau, en CENTIMES, lu dans le tableau §3.4 de docs/CAHIER-API.md. " +
      'Le prix est calcule SERVEUR et seulement serveur (cahier §1.4) : le front affiche ' +
      "amount_cents renvoye par l'API, il ne le calcule jamais. Repond ABSENT hors des heures tarifees.",
    inputSchema: {
      heure: z.number().int().optional().describe('Heure de debut du creneau, 10 a 18 (heure murale Paris)'),
      starts_at: z
        .string()
        .optional()
        .describe('Alternative : instant de debut, ex. 2026-09-22T11:00:00+02:00 ou 2026-09-22T11:00'),
    },
    outputSchema: {
      trouve: z.boolean(),
      heure: z.number().int().nullable(),
      kind: z.string().nullable(),
      amount_cents: z.number().int().nullable(),
      source: z.string().nullable(),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ heure, starts_at }) {
    const vide = { trouve: false, heure: null, kind: null, amount_cents: null, source: null }

    let h = heure
    let contexte = null
    if (h === undefined || h === null) {
      if (!starts_at) {
        return invalide('fournir `heure` (10 a 18) ou `starts_at`.', { donnees: vide })
      }
      const a = horloge.analyserInstant(starts_at)
      if (a.erreur) return invalide(`starts_at : ${a.erreur}`, { donnees: vide })
      h = horloge.composantesParis(a.instant).heure
      contexte = `${a.interpretation} → heure murale Paris retenue : ${h} h (${horloge.isoParis(a.instant)})`
    }

    const r = moteur.tarifPourHeure(h)
    if (!r.trouve) {
      return absent(r.message.replace(/^ABSENT DU CONTRAT : /, ''), r.heures_connues || [], {
        donnees: { ...vide, heure: h },
      })
    }

    return structure(
      [
        contexte,
        `Creneau de ${h} h → tarif "${r.kind}" = ${r.amount_cents} centimes (${(r.amount_cents / 100).toFixed(2)} EUR).`,
        `Plage "${r.kind}" : ${r.creneaux}.`,
        '',
        'Rappel §1.4 : montants en centimes, prix calcule serveur uniquement. ' +
          'Rappel §3.5 : amount_cents est FIGE au hold — un checkout envoie le montant en base, jamais un recalcul.',
      ]
        .filter(Boolean)
        .join('\n'),
      { trouve: true, heure: h, kind: r.kind, amount_cents: r.amount_cents, source: r.source },
      [r.source, `${cahier.FICHIER} §1.4 (centimes, prix serveur)`],
    )
  },
}

// ---------------------------------------------------------------------------
// 11 — grille_creneaux
// ---------------------------------------------------------------------------

const ligneCreneau = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  tariff: z.string().nullable(),
  amount_cents: z.number().int().nullable(),
  capacity: z.number().int().nullable(),
  taken: z.null(),
  state: z.string(),
  raison: z.string().nullable(),
})

const grille = {
  nom: 'grille_creneaux',
  config: {
    title: 'Grille de creneaux, calculee hors base',
    description:
      'Une ligne par heure de creneau type (§3.3), avec tarif, capacite et etat calculable hors base. ' +
      "taken vaut TOUJOURS null et l'etat n'est JAMAIS full : ce serveur n'a aucune base, il ne peut " +
      "pas connaitre l'occupation reelle. Pour l'occupation, appeler GET /clubs/{club_id}/slots.",
    inputSchema: {
      club: z.string().describe('minimes | st-cyprien | etats-unis | ramonville | portet'),
      espace: z.string().optional().describe('Espace du club, ex. boxe, mma-sol, salle'),
      date: z.string().optional().describe('Jour unique, YYYY-MM-DD'),
      from: z.string().optional().describe('Debut de plage, YYYY-MM-DD'),
      to: z.string().optional().describe('Fin de plage incluse, YYYY-MM-DD (max 14 jours)'),
    },
    outputSchema: {
      club: z.string(),
      espace: z.string().nullable(),
      jours: z.array(
        z.object({
          date: z.string(),
          jour: z.string(),
          creneaux: z.array(ligneCreneau),
          raison: z.string().nullable(),
        }),
      ),
      occupation: z.string(),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ club, espace, date, from, to }) {
    const vide = { club: String(club || ''), espace: espace || null, jours: [], occupation: '' }

    let dates = []
    if (date) {
      dates = [date]
    } else if (from && to) {
      dates = plageDeDates(from, to)
      if (dates.erreur) return invalide(dates.erreur, { donnees: vide })
    } else {
      return invalide('fournir `date`, ou `from` et `to`.', { donnees: vide })
    }

    const jours = []
    for (const d of dates) {
      const g = moteur.grilleDuJour({ club, espace, date: d })
      if (g.erreur) {
        return absent(g.erreur.replace(/^ABSENT DU CONTRAT : /, ''), [], { donnees: vide })
      }
      jours.push({ date: g.date, jour: g.jour, creneaux: g.creneaux, raison: g.raison || null })
    }

    const premier = moteur.grilleDuJour({ club, espace, date: dates[0] })
    const corps = jours
      .map((j) => {
        if (!j.creneaux.length) return `${j.date} (${j.jour}) : ${j.raison}`
        return (
          `${j.date} (${j.jour})\n` +
          tableauTexte(j.creneaux, [
            { titre: 'DEBUT', cle: (c) => c.starts_at.slice(11, 16) },
            { titre: 'FIN', cle: (c) => c.ends_at.slice(11, 16) },
            { titre: 'TARIF', cle: 'tariff' },
            { titre: 'CENTIMES', cle: 'amount_cents' },
            { titre: 'CAPACITE', cle: 'capacity' },
            { titre: 'TAKEN', cle: (c) => 'null' },
            { titre: 'ETAT', cle: 'state' },
            { titre: 'RAISON', cle: (c) => (c.raison ? c.raison.slice(0, 90) : '') },
          ])
        )
      })
      .join('\n\n')

    return structure(
      `${corps}\n\n${premier.occupation}`,
      { club, espace: espace || null, jours, occupation: premier.occupation },
      premier.sources,
    )
  },
}

function plageDeDates(from, to) {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/
  if (!re.test(from) || !re.test(to)) return { erreur: '`from` et `to` doivent etre au format YYYY-MM-DD.' }
  const d1 = new Date(`${from}T12:00:00Z`)
  const d2 = new Date(`${to}T12:00:00Z`)
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return { erreur: 'dates invalides.' }
  if (d2 < d1) return { erreur: '`to` est anterieur a `from`.' }
  const jours = Math.round((d2 - d1) / 86400000) + 1
  if (jours > 14) return { erreur: `plage de ${jours} jours : maximum 14 (limiter la taille de la reponse).` }
  const out = []
  for (let i = 0; i < jours; i += 1) {
    const d = new Date(d1.getTime() + i * 86400000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

// ---------------------------------------------------------------------------
// 12 — horloge_reservation
// ---------------------------------------------------------------------------

const horlogeOutil = {
  nom: 'horloge_reservation',
  config: {
    title: 'Toutes les echeances d\'une reservation',
    description:
      "hold_expires_at, limite d'annulation, fenetre QR, moment du passage a consumed — en ISO " +
      'Europe/Paris avec decalage explicite. Le decalage est demande a Intl pour l\'instant ' +
      "considere, jamais code en dur : Paris passe de +02:00 a +01:00 le dernier dimanche d'octobre, " +
      "et une limite « 24 h avant » calculee en UTC naif se trompe d'une heure deux fois par an.",
    inputSchema: {
      starts_at: z.string().describe('Debut du creneau, ex. 2026-10-25T11:00:00+02:00 ou 2026-10-25T11:00'),
      held_at: z.string().optional().describe('Instant de pose du hold, pour calculer hold_expires_at'),
    },
    outputSchema: {
      starts_at: z.string(),
      ends_at: z.string(),
      hold_expires_at: z.string().nullable(),
      annulation_limite: z.string(),
      annulation_limite_civile: z.string(),
      annulation_divergence_heure_dete: z.boolean(),
      qr_nbf: z.string(),
      qr_exp: z.string(),
      consumed_apres: z.string(),
      fuseau: z.string(),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ starts_at, held_at }) {
    const r = moteur.horlogeReservation({ starts_at, held_at })
    if (r.erreur) return invalide(r.erreur)

    const corps = [
      `Interpretation de l'entree : ${r.interpretation}`,
      '',
      `starts_at            : ${r.starts_at}`,
      `ends_at              : ${r.ends_at}   (creneau d'une heure, §3.5)`,
      `hold_expires_at      : ${r.hold_expires_at || '(fournir held_at pour l\'obtenir)'}   (+${r.hold_ttl_seconds} s, §3.9)`,
      `annulation_limite    : ${r.annulation_limite}   (24 h ABSOLUES avant le creneau)`,
      `  variante civile    : ${r.annulation_limite_civile}   (meme heure murale, la veille)`,
      `qr_nbf               : ${r.qr_nbf}`,
      `qr_exp               : ${r.qr_exp}`,
      `consumed_apres       : ${r.consumed_apres}`,
      '',
      r.avertissement || 'Pas de changement d\'heure entre la limite et le creneau : les deux variantes coincident.',
      '',
      'Rappel §1.6 : toute regle metier utilise l\'heure serveur Europe/Paris, jamais Date du navigateur.',
    ].join('\n')

    const { entree, interpretation, hold_ttl_seconds, avertissement, sources, ...donnees } = r
    return structure(corps, donnees, sources)
  },
}

// ---------------------------------------------------------------------------
// 13 — fenetre_qr
// ---------------------------------------------------------------------------

const fenetreQr = {
  nom: 'fenetre_qr',
  config: {
    title: 'Fenetre de validite d\'un QR',
    description:
      'nbf, exp et les etats possibles du QR, selon §9 du cahier. Hors fenetre, le contrat exige ' +
      '410 QR_WINDOW_CLOSED ; sur un autre club, 422 QR_WRONG_CLUB. Le QR ne se genere que sur une ' +
      'reservation confirmed (409 SIGNATURE_REQUIRED ou PAYMENT_REQUIRED sinon).',
    inputSchema: {
      starts_at: z.string().describe('Debut du creneau'),
      ends_at: z.string().optional().describe('Fin du creneau. Deduit a +1 h si absent.'),
    },
    annotations: ANNOTATIONS,
  },
  async handler({ starts_at, ends_at }) {
    const r = moteur.fenetreQr({ starts_at, ends_at })
    if (r.erreur) return invalide(r.erreur)

    return texte(
      [
        `valid_from (nbf) : ${r.valid_from}   (starts_at − ${r.qr_early_minutes} min)`,
        `valid_to   (exp) : ${r.valid_to}${r.ends_at_deduit ? '   (ends_at deduit : starts_at + 1 h, §3.5)' : ''}`,
        `etats possibles  : ${r.etats.join(' | ')}`,
        '',
        'Le payload du QR ne contient QUE { jti, club_id, exp, nbf } — pas de nom, pas de ' +
          'deciplus_member_id, pas l\'UUID de reservation en clair (§9). Le secret HMAC ne sort jamais ' +
          'du serveur : ni dans le PNG, ni dans le front, ni dans un mail.',
      ].join('\n'),
      r.sources,
    )
  },
}

// ---------------------------------------------------------------------------
// 14 — transitions
// ---------------------------------------------------------------------------

const transitions = {
  nom: 'transitions',
  config: {
    title: 'Transitions legales d\'un statut',
    description:
      "Les statuts atteignables depuis un statut, qui les pose, sous quelle condition, quel " +
      "evenement part — plus la barriere de §2. Chaque transition cite la phrase du cahier qui " +
      "l'etablit, avec sa ligne ; si la phrase a disparu du fichier, la transition est signalee " +
      'comme a revalider, pas servie comme un acquis.',
    inputSchema: { statut: z.string().describe('held | awaiting_signature | confirmed | consumed | expired | payment_failed | cancelled_credit | no_show') },
    annotations: ANNOTATIONS,
  },
  async handler({ statut }) {
    const r = moteur.transitions(statut)
    if (!r.trouve) return absent(r.message.replace(/^ABSENT DU CONTRAT : /, ''), r.statuts_valides)

    const corps = [
      `Statut "${r.statut}"${r.dans_enum_openapi ? '' : '  ⚠ ABSENT de l\'enum ReservationStatus'}`,
      `  signification : ${r.signification || '(non documentee)'}`,
      `  pose par      : ${r.qui_le_pose || '(non documente)'}`,
      '',
      r.terminal
        ? 'AUCUNE transition sortante documentee : statut terminal.'
        : 'Transitions sortantes :\n' +
          r.atteignables
            .map(
              (a) =>
                `  → ${a.vers}\n` +
                `      pose par  : ${a.qui_le_pose}\n` +
                `      condition : ${a.condition}\n` +
                `      event     : ${a.event_emis || '(aucun)'}\n` +
                `      preuve    : ${a.citation ? `« ${a.citation.texte} » (${cahier.FICHIER} §${a.citation.section}, ligne ${a.citation.ligne})` : a.citation_introuvable}`,
            )
            .join('\n'),
      '',
      `Barriere : ${r.barriere || '(introuvable en §2)'}${r.ligne_barriere ? `  (ligne ${r.ligne_barriere})` : ''}`,
      `Statuts actifs (limite de 3) : ${r.statuts_actifs.join(', ')}`,
      r.avertissements.length ? `\nAVERTISSEMENT :\n  · ${r.avertissements.join('\n  · ')}` : null,
      r.lacunes.length
        ? '\nLACUNE DU CONTRAT :\n' +
          r.lacunes
            .map(
              (l) =>
                `  · ${l.quoi} : ${l.detail}${l.citation ? `\n      « ${l.citation.texte} » (ligne ${l.citation.ligne})` : ''}`,
            )
            .join('\n')
        : null,
      r.diagramme ? `\nDiagramme §2, tel qu'il est ecrit :\n${r.diagramme}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    return texte(corps, r.sources)
  },
}

// ---------------------------------------------------------------------------
// 15 — evenements
// ---------------------------------------------------------------------------

const evenements = {
  nom: 'evenements',
  config: {
    title: 'Bus d\'evenements interne',
    description:
      "Les evenements du §11 : producteur, consommateurs, et ce qui est interdit dans les mails " +
      '(secret HMAC, deciplus_member_id dans le mail salle). Un event produit par un lot et ' +
      "consomme par un autre est un point de couture : s'en assurer avant d'ecrire l'emetteur.",
    inputSchema: { nom: z.string().optional().describe('Nom exact, ex. reservation.cancelled. Omis : tout le tableau.') },
    annotations: ANNOTATIONS,
  },
  async handler({ nom }) {
    const e = cahier.evenements()
    if (!e.lignes.length) {
      return absent(`le tableau des evenements (§11) est introuvable dans ${cahier.FICHIER}.`, [])
    }

    const interdits = e.notes.filter((n) => /pas |ne contiennent pas|jamais/i.test(n.texte))

    if (nom) {
      const ligne = e.lignes.find((l) => l.event === String(nom).trim())
      if (!ligne) {
        return absent(`l'evenement "${nom}" n'est pas declare en §11.`, e.lignes.map((l) => l.event))
      }
      return texte(
        [
          `event         : ${ligne.event}${ligne.precision ? `  ${ligne.precision}` : ''}`,
          `producteur    : ${ligne.producteur}`,
          `consommateurs : ${ligne.consommateurs}`,
          '',
          'Interdits dans le mail (§11) :',
          ...interdits.map((n) => `  · ${n.texte}  (ligne ${n.ligne})`),
        ].join('\n'),
        [`${cahier.FICHIER} §11, ligne ${ligne.ligne}`],
      )
    }

    return texte(
      tableauTexte(e.lignes, [
        { titre: 'EVENT', cle: 'event' },
        { titre: 'PRODUCTEUR', cle: 'producteur' },
        { titre: 'CONSOMMATEURS', cle: 'consommateurs' },
        { titre: 'LIGNE', cle: 'ligne' },
      ]) +
        '\n\nInterdits dans le mail (§11) :\n' +
        interdits.map((n) => `  · ${n.texte}  (ligne ${n.ligne})`).join('\n'),
      [`${cahier.FICHIER} §11`],
    )
  },
}

export const OUTILS = [tarif, grille, horlogeOutil, fenetreQr, transitions, evenements]
