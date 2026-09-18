/**
 * Tests de la grille — LOT C.
 *
 * Tout est pur : `maintenant` est une constante du test, jamais `Date.now()`.
 * On déplace la donnée, jamais l'horloge.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLES_CRENEAU_PUBLIC,
  construireGrille,
  estBloque,
  etatDuCreneau,
  grillePublique,
  occupeUnSiege,
  reglesEducativeParDefaut,
  verifierCreneauReservable,
  versCreneauPublic,
  type BlocagePonctuel,
  type CreneauInterne,
  type RegleBlocage,
  type ReservationDuCreneau,
} from './creneaux.ts'
import {
  HEURES_CREUSES,
  HEURES_CRENEAUX,
  HEURES_PLEINES,
  REGLAGES_DEFAUT,
  tarifDeLHeure,
} from './contrat.ts'
import { instantDepuisParis, partiesParis } from './horloge.ts'

function instant(a: number, mo: number, j: number, h: number, mi = 0): number {
  const r = instantDepuisParis(a, mo, j, h, mi)
  assert.notEqual(r.genre, 'inexistant')
  return r.ms
}

const LUNDI = '2026-09-21'
const MERCREDI = '2026-09-23'
const SAMEDI = '2026-09-26'
const DIMANCHE = '2026-09-27'
/** Bien avant tous les créneaux testés : ils sont donc à venir. */
const AVANT = instant(2026, 9, 20, 12)

test('U2 — une journée ouvrée rend NEUF créneaux, le dernier à 18:00→19:00', () => {
  const grille = construireGrille({ du: LUNDI, au: LUNDI, maintenant: AVANT, espaceId: 'salle' })
  assert.equal(grille.length, 9)

  const premier = grille[0]
  const dernier = grille[grille.length - 1]
  assert.ok(premier && dernier)
  assert.equal(premier.debutIso, '2026-09-21T10:00:00+02:00')
  assert.equal(dernier.debutIso, '2026-09-21T18:00:00+02:00')
  assert.equal(dernier.finIso, '2026-09-21T19:00:00+02:00')

  // Le créneau fantôme de 19 h n’existe pas, et personne ne le fabriquera par
  // inadvertance : la borne haute est 18 incluse, pas 19.
  assert.equal(
    grille.filter((c) => c.heureParis === 19).length,
    0,
    'un créneau 19:00→20:00 s’est glissé dans la grille',
  )
  assert.deepEqual(
    grille.map((c) => c.heureParis),
    [...HEURES_CRENEAUX],
  )
  // Chaque créneau dure exactement une heure.
  for (const c of grille) assert.equal(c.finMs - c.debutMs, 3_600_000)
})

test('U4 — le dimanche ne produit aucun créneau : il n’est pas bloqué, il n’existe pas', () => {
  assert.equal(partiesParis(instant(2026, 9, 27, 12)).isodow, 7)
  assert.deepEqual(
    construireGrille({ du: DIMANCHE, au: DIMANCHE, maintenant: AVANT, espaceId: 'salle' }),
    [],
  )
  // Sur une semaine complète : six jours ouvrés × neuf créneaux.
  const semaine = construireGrille({
    du: LUNDI,
    au: DIMANCHE,
    maintenant: AVANT,
    espaceId: 'salle',
  })
  assert.equal(semaine.length, 54)
  assert.equal(semaine.filter((c) => c.isodow === 7).length, 0)
})

test('U3 — les tarifs partitionnent exactement les neuf heures de la grille', () => {
  const creuses = new Set<number>(HEURES_CREUSES)
  const pleines = new Set<number>(HEURES_PLEINES)
  const grille = new Set<number>(HEURES_CRENEAUX)

  assert.equal(creuses.size + pleines.size, grille.size, 'un trou ou un doublon de tarification')
  for (const h of grille) {
    assert.equal(
      Number(creuses.has(h)) + Number(pleines.has(h)),
      1,
      `l’heure ${h} est dans zéro ou deux tarifs`,
    )
  }
  for (const h of creuses) assert.ok(grille.has(h), `${h} tarifée mais hors grille`)
  for (const h of pleines) assert.ok(grille.has(h), `${h} tarifée mais hors grille`)

  assert.deepEqual([...creuses].sort((a, b) => a - b), [10, 11, 14, 15, 16])
  assert.deepEqual([...pleines].sort((a, b) => a - b), [12, 13, 17, 18])
})

test('le montant suit le genre de tarif, et les défauts sont ceux du cahier', () => {
  const grille = construireGrille({ du: LUNDI, au: LUNDI, maintenant: AVANT, espaceId: 'salle' })
  for (const c of grille) {
    assert.equal(c.tarif, tarifDeLHeure(c.heureParis))
    assert.equal(
      c.montantCents,
      c.tarif === 'peak' ? REGLAGES_DEFAUT.peak_cents : REGLAGES_DEFAUT.offpeak_cents,
    )
  }
  assert.equal(REGLAGES_DEFAUT.offpeak_cents, 1000)
  assert.equal(REGLAGES_DEFAUT.peak_cents, 1500)

  // La direction change les montants : le moteur ne code aucun prix en dur.
  const majoree = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    tarifs: { offpeak: 1200, peak: 1800 },
  })
  assert.deepEqual(
    [...new Set(majoree.map((c) => c.montantCents))].sort((a, b) => a - b),
    [1200, 1800],
  )
})

test('U5 — précédence d’état : past > blocked > full > open', () => {
  const base = { debutMs: 2_000, maintenant: 1_000, bloque: false, pris: 0, capacite: 2 }
  assert.equal(etatDuCreneau(base), 'open')
  assert.equal(etatDuCreneau({ ...base, pris: 2 }), 'full')
  assert.equal(etatDuCreneau({ ...base, pris: 2, bloque: true }), 'blocked')
  assert.equal(
    etatDuCreneau({ ...base, debutMs: 500, pris: 2, bloque: true }),
    'past',
    'un créneau passé ET bloqué ET plein est `past` : « boxe éducative » n’a aucun sens sur la semaine dernière',
  )
  // La frontière du passé : `debutMs <= maintenant` (§8-Q3). On ne réserve pas
  // une séance commencée.
  assert.equal(etatDuCreneau({ ...base, debutMs: 1_000 }), 'past')
  assert.equal(etatDuCreneau({ ...base, debutMs: 1_001 }), 'open')
  // `>=` et non `>` : la direction peut abaisser la capacité sans rien annuler.
  assert.equal(etatDuCreneau({ ...base, pris: 2, capacite: 1 }), 'full')
  assert.equal(etatDuCreneau({ ...base, pris: 1, capacite: 2 }), 'open')
})

test('U6 — un hold périmé n’occupe rien, même si le cron n’est pas passé', () => {
  const maintenant = 1_000_000
  assert.equal(occupeUnSiege({ statut: 'held', holdExpireMs: maintenant - 1 }, maintenant), false)
  assert.equal(occupeUnSiege({ statut: 'held', holdExpireMs: maintenant }, maintenant), false)
  assert.equal(occupeUnSiege({ statut: 'held', holdExpireMs: maintenant + 1 }, maintenant), true)
  assert.equal(occupeUnSiege({ statut: 'held', holdExpireMs: null }, maintenant), false)
  assert.equal(
    occupeUnSiege({ statut: 'awaiting_signature', holdExpireMs: null }, maintenant),
    true,
  )
  assert.equal(occupeUnSiege({ statut: 'confirmed', holdExpireMs: null }, maintenant), true)
  for (const mort of ['expired', 'payment_failed', 'cancelled_credit', 'consumed', 'no_show'] as const) {
    assert.equal(
      occupeUnSiege({ statut: mort, holdExpireMs: maintenant + 10_000 }, maintenant),
      false,
      mort,
    )
  }
})

test('les holds morts ne consomment pas de siège dans la grille', () => {
  const debut = instant(2026, 9, 21, 10)
  const reservations: ReservationDuCreneau[] = [
    { debutMs: debut, coachId: 'a', statut: 'held', holdExpireMs: AVANT - 1 },
    { debutMs: debut, coachId: 'b', statut: 'held', holdExpireMs: AVANT - 1 },
  ]
  const grille = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    reservations,
  })
  const dix = grille.find((c) => c.heureParis === 10)
  assert.ok(dix)
  assert.equal(dix.pris, 0)
  assert.equal(dix.etat, 'open')
})

test('capacité 2 : deux occupants ferment le créneau', () => {
  const debut = instant(2026, 9, 21, 11)
  const reservations: ReservationDuCreneau[] = [
    { debutMs: debut, coachId: 'a', statut: 'confirmed', holdExpireMs: null },
    { debutMs: debut, coachId: 'b', statut: 'held', holdExpireMs: AVANT + 600_000 },
  ]
  const grille = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    reservations,
  })
  const onze = grille.find((c) => c.heureParis === 11)
  assert.ok(onze)
  assert.equal(onze.pris, 2)
  assert.equal(onze.etat, 'full')
  const dix = grille.find((c) => c.heureParis === 10)
  assert.equal(dix?.etat, 'open')
})

test('les réservations d’un autre espace ou d’un autre club ne comptent pas', () => {
  const debut = instant(2026, 9, 21, 10)
  const reservations: ReservationDuCreneau[] = [
    { debutMs: debut, coachId: 'a', statut: 'confirmed', holdExpireMs: null, espaceId: 'mma-sol' },
    {
      debutMs: debut,
      coachId: 'b',
      statut: 'confirmed',
      holdExpireMs: null,
      clubId: 'st-cyprien',
      espaceId: 'salle',
    },
    { debutMs: debut, coachId: 'c', statut: 'confirmed', holdExpireMs: null, espaceId: 'salle' },
  ]
  const grille = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    clubId: 'minimes',
    reservations,
  })
  const dix = grille.find((c) => c.heureParis === 10)
  assert.equal(dix?.pris, 1, '« salle » existe à Minimes, St-Cyprien et Ramonville : la clé porte le club')
})

test('U7 — payload public : liste blanche stricte, aucun nom de coach', () => {
  const debut = instant(2026, 9, 21, 12)
  const options = {
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    reservations: [
      { debutMs: debut, coachId: 'coach-aaa', statut: 'confirmed', holdExpireMs: null },
    ] as ReservationDuCreneau[],
  }

  const anonyme = grillePublique(options, null)
  const attendues = [...CLES_CRENEAU_PUBLIC].sort()
  for (const creneau of anonyme) {
    assert.deepEqual(Object.keys(creneau).sort(), attendues)
  }

  const coach = grillePublique(options, { genre: 'coach', id: 'coach-aaa' })
  for (const creneau of coach) {
    assert.deepEqual(Object.keys(creneau).sort(), [...attendues, 'mine'].sort())
  }

  // Aucune clé ne parle de coach, de nom ou de Deciplus, à aucun niveau.
  const serialise = JSON.stringify(coach)
  assert.equal(serialise.includes('coach-aaa'), false, 'un identifiant de coach a fuité')
  for (const creneau of [...anonyme, ...coach]) {
    for (const cle of Object.keys(creneau)) {
      assert.doesNotMatch(cle, /coach|name|nom|deciplus|email|phone/i, cle)
    }
  }
})

test('`mine` ne dit vrai que pour le coach concerné, et n’existe pas pour un anonyme', () => {
  const debut = instant(2026, 9, 21, 12)
  const options = {
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    reservations: [
      { debutMs: debut, coachId: 'coach-aaa', statut: 'confirmed', holdExpireMs: null },
    ] as ReservationDuCreneau[],
  }
  const aMoi = grillePublique(options, { genre: 'coach', id: 'coach-aaa' })
  const pasAMoi = grillePublique(options, { genre: 'coach', id: 'coach-bbb' })
  const anonyme = grillePublique(options, null)

  assert.equal(aMoi.find((c) => c.starts_at.endsWith('T12:00:00+02:00'))?.mine, true)
  assert.equal(pasAMoi.find((c) => c.starts_at.endsWith('T12:00:00+02:00'))?.mine, false)
  assert.equal('mine' in (anonyme[0] ?? {}), false)
  // Le coach B voit quand même que le siège est pris — un planning public le doit.
  assert.equal(pasAMoi.find((c) => c.starts_at.endsWith('T12:00:00+02:00'))?.taken, 1)
})

test('versCreneauPublic ne recopie jamais la ligne interne', () => {
  const interne: CreneauInterne = {
    debutMs: 1,
    finMs: 2,
    debutIso: 'a',
    finIso: 'b',
    heureParis: 10,
    isodow: 1,
    jourParis: '2026-09-21',
    tarif: 'offpeak',
    montantCents: 1000,
    capacite: 2,
    pris: 1,
    etat: 'open',
    coachsOccupants: ['coach-secret'],
  }
  const publie = versCreneauPublic(interne, null)
  assert.equal('coachsOccupants' in publie, false)
  assert.equal('debutMs' in publie, false)
  assert.equal('jourParis' in publie, false)
  assert.equal(JSON.stringify(publie).includes('coach-secret'), false)
})

test('E2 — blocage éducative : mercredi et samedi 15 h et 16 h, en base et pas en CSS', () => {
  const reglesMinimes = reglesEducativeParDefaut('minimes')
  assert.equal(reglesMinimes.length, 4)
  assert.deepEqual(
    reglesMinimes.map((r) => `${r.isodow}-${r.heure}`).sort(),
    ['3-15', '3-16', '6-15', '6-16'],
  )
  assert.ok(reglesMinimes.every((r) => r.actif))

  for (const jour of [MERCREDI, SAMEDI]) {
    const grille = construireGrille({
      du: jour,
      au: jour,
      maintenant: AVANT,
      espaceId: 'salle',
      regles: reglesMinimes,
    })
    assert.deepEqual(
      grille.filter((c) => c.etat === 'blocked').map((c) => c.heureParis),
      [15, 16],
      jour,
    )
  }
  // Le lundi n’est pas touché.
  const lundi = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    regles: reglesMinimes,
  })
  assert.equal(lundi.filter((c) => c.etat === 'blocked').length, 0)
})

test('E2bis — Portet est paramétrable : mêmes règles, inactives par défaut', () => {
  const reglesPortet = reglesEducativeParDefaut('portet')
  assert.equal(reglesPortet.length, 4)
  assert.ok(reglesPortet.every((r) => !r.actif))

  const grille = construireGrille({
    du: MERCREDI,
    au: MERCREDI,
    maintenant: AVANT,
    espaceId: 'boxe-fitness',
    regles: reglesPortet,
  })
  assert.equal(grille.filter((c) => c.etat === 'blocked').length, 0)
  assert.equal(grille.find((c) => c.heureParis === 15)?.etat, 'open')

  // La direction réactive depuis le back-office : une ligne, aucun déploiement.
  const reactivees: RegleBlocage[] = reglesPortet.map((r) => ({ ...r, actif: true }))
  const apres = construireGrille({
    du: MERCREDI,
    au: MERCREDI,
    maintenant: AVANT,
    espaceId: 'boxe-fitness',
    regles: reactivees,
  })
  assert.deepEqual(
    apres.filter((c) => c.etat === 'blocked').map((c) => c.heureParis),
    [15, 16],
  )
})

test('Q4 — l’exception datée l’emporte toujours sur la règle récurrente', () => {
  const regles = reglesEducativeParDefaut('minimes')
  const quinzeHeures = instant(2026, 9, 23, 15)
  const deblocage: BlocagePonctuel[] = [
    { debutMs: quinzeHeures, espaceId: 'salle', genre: 'unblock', raison: 'pas d’éducative' },
  ]
  const grille = construireGrille({
    du: MERCREDI,
    au: MERCREDI,
    maintenant: AVANT,
    espaceId: 'salle',
    regles,
    blocages: deblocage,
  })
  assert.equal(grille.find((c) => c.heureParis === 15)?.etat, 'open')
  assert.equal(grille.find((c) => c.heureParis === 16)?.etat, 'blocked')

  // Et le blocage ponctuel sur un jour sans règle.
  const blocage: BlocagePonctuel[] = [
    { debutMs: instant(2026, 9, 21, 11), espaceId: 'salle', genre: 'block', raison: 'travaux' },
  ]
  const lundi = construireGrille({
    du: LUNDI,
    au: LUNDI,
    maintenant: AVANT,
    espaceId: 'salle',
    blocages: blocage,
  })
  assert.deepEqual(
    lundi.filter((c) => c.etat === 'blocked').map((c) => c.heureParis),
    [11],
  )
})

test('estBloque : une règle « tous espaces » couvre l’espace demandé', () => {
  const debutMs = instant(2026, 9, 23, 15)
  const commun = { isodow: 3, heure: 15, debutMs, blocages: [] as BlocagePonctuel[] }
  assert.equal(
    estBloque({
      ...commun,
      espaceId: 'mma-sol',
      regles: [{ isodow: 3, heure: 15, espaceId: null, actif: true }],
    }),
    true,
  )
  assert.equal(
    estBloque({
      ...commun,
      espaceId: 'mma-sol',
      regles: [{ isodow: 3, heure: 15, espaceId: 'boxe', actif: true }],
    }),
    false,
  )
  assert.equal(
    estBloque({
      ...commun,
      espaceId: 'mma-sol',
      regles: [{ isodow: 3, heure: 15, espaceId: null, actif: false }],
    }),
    false,
  )
})

test('E6 — la grille traverse la bascule d’heure sans décaler un seul créneau', () => {
  const grille = construireGrille({
    du: '2026-10-23',
    au: '2026-10-27',
    maintenant: instant(2026, 10, 22, 12),
    espaceId: 'salle',
  })
  const jours = [...new Set(grille.map((c) => c.jourParis))]
  assert.deepEqual(jours, ['2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27'])
  assert.equal(grille.length, 36, 'quatre jours ouvrés × neuf créneaux')
  assert.equal(
    grille.filter((c) => c.jourParis === '2026-10-25').length,
    0,
    'le dimanche de bascule ne porte aucun créneau',
  )

  const dixHeures = grille.filter((c) => c.heureParis === 10)
  assert.deepEqual(
    dixHeures.map((c) => c.debutIso),
    [
      '2026-10-23T10:00:00+02:00',
      '2026-10-24T10:00:00+02:00',
      '2026-10-26T10:00:00+01:00',
      '2026-10-27T10:00:00+01:00',
    ],
  )
  // Chaque journée porte bien neuf heures distinctes, avant comme après.
  for (const jour of jours) {
    const duJour = grille.filter((c) => c.jourParis === jour)
    assert.equal(duJour.length, 9, jour)
    assert.deepEqual(duJour.map((c) => c.heureParis), [...HEURES_CRENEAUX], jour)
  }
})

test('verifierCreneauReservable refuse ce qui n’est pas dans la grille', () => {
  const maintenant = instant(2026, 9, 20, 12)
  assert.equal(verifierCreneauReservable({ debutMs: instant(2026, 9, 21, 10), maintenant }), null)
  assert.equal(verifierCreneauReservable({ debutMs: instant(2026, 9, 21, 18), maintenant }), null)
  // Dimanche.
  assert.equal(
    verifierCreneauReservable({ debutMs: instant(2026, 9, 27, 10), maintenant }),
    'VALIDATION_ERROR',
  )
  // 19 h : hors grille, et c’est le fantôme que le test U2 traque.
  assert.equal(
    verifierCreneauReservable({ debutMs: instant(2026, 9, 21, 19), maintenant }),
    'VALIDATION_ERROR',
  )
  // 9 h : avant l’ouverture.
  assert.equal(
    verifierCreneauReservable({ debutMs: instant(2026, 9, 21, 9), maintenant }),
    'VALIDATION_ERROR',
  )
  // Pas pile à l’heure.
  assert.equal(
    verifierCreneauReservable({ debutMs: instant(2026, 9, 21, 10, 30), maintenant }),
    'VALIDATION_ERROR',
  )
  // Dans le passé.
  assert.equal(
    verifierCreneauReservable({ debutMs: instant(2026, 9, 18, 10), maintenant }),
    'VALIDATION_ERROR',
  )
})

test('construireGrille refuse un intervalle illisible plutôt que de rendre une grille vide', () => {
  assert.throws(
    () => construireGrille({ du: '21/09/2026', au: LUNDI, maintenant: AVANT, espaceId: 'salle' }),
    /invalide/,
  )
})
