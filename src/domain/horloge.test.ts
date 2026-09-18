/**
 * Tests de l'horloge Europe/Paris — LOT C.
 *
 * `node --test --experimental-strip-types src/domain/*.test.ts` (script `test:moteur`).
 *
 * Le dimanche de bascule est traité explicitement, parce que c'est le seul jour
 * de l'année où « 02:30 » désigne zéro ou deux instants. Il ne peut pas porter de
 * créneau (dimanche fermé, bascule à 02:00/03:00, plage métier 10:00–19:00) —
 * raison de plus pour le tester : le jour où quelqu'un élargira la plage ou
 * ouvrira le dimanche, ces assertions parleront avant la salle.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyserInstantParis,
  analyserJourCivil,
  decalageParisMs,
  formaterHeure,
  formaterJourLong,
  formaterPlage,
  instantDepuisParis,
  instantParisOuNull,
  isoParis,
  jourParis,
  joursCivils,
  offsetParisIso,
  partiesParis,
  // @ts-expect-error TS5097 -- Node exige l'extension .ts (voir l'en-tête de horloge.ts).
} from './horloge.ts'

/** Raccourci : l'instant d'une heure murale Paris dont on sait qu'elle existe. */
function instant(a: number, mo: number, j: number, h: number, mi = 0): number {
  const r = instantDepuisParis(a, mo, j, h, mi)
  assert.notEqual(r.genre, 'inexistant', `${a}-${mo}-${j} ${h}:${mi} devrait exister`)
  return r.ms
}

test('U1a — les deux dimanches de bascule sont bien des dimanches', () => {
  assert.equal(partiesParis(instant(2026, 10, 25, 12)).isodow, 7)
  assert.equal(partiesParis(instant(2027, 3, 28, 12)).isodow, 7)
})

test('U1b — trou de printemps : 02:30 le dernier dimanche de mars n’existe pas', () => {
  const r = instantDepuisParis(2027, 3, 28, 2, 30)
  assert.equal(r.genre, 'inexistant')
  // Et le moteur ne fabrique jamais d’instant silencieusement à partir de ce trou.
  assert.equal(instantParisOuNull(2027, 3, 28, 2, 30), null)

  // 01:30 et 03:30 existent, de part et d’autre du saut, à une heure d’intervalle.
  const avant = instantDepuisParis(2027, 3, 28, 1, 30)
  const apres = instantDepuisParis(2027, 3, 28, 3, 30)
  assert.equal(avant.genre, 'exact')
  assert.equal(apres.genre, 'exact')
  assert.equal(apres.ms - avant.ms, 3_600_000)
  assert.equal(offsetParisIso(avant.ms), '+01:00')
  assert.equal(offsetParisIso(apres.ms), '+02:00')
})

test('U1c — heure doublée d’automne : on retient la PREMIÈRE occurrence (CEST)', () => {
  const r = instantDepuisParis(2026, 10, 25, 2, 30)
  assert.equal(r.genre, 'ambigu')
  if (r.genre !== 'ambigu') return
  assert.equal(r.aussiMs - r.ms, 3_600_000)
  assert.equal(offsetParisIso(r.ms), '+02:00')
  assert.equal(offsetParisIso(r.aussiMs), '+01:00')
  // Les deux instants portent la même heure murale : c’est bien une ambiguïté.
  assert.equal(partiesParis(r.ms).heure, 2)
  assert.equal(partiesParis(r.aussiMs).heure, 2)
  // D’où la règle des exports : jamais d’heure nue, toujours l’offset.
  assert.notEqual(isoParis(r.ms), isoParis(r.aussiMs))
})

test('U1d — un créneau de 10 h reste à 10 h de part et d’autre de la bascule', () => {
  for (const [a, mo, j, offset] of [
    [2026, 10, 23, '+02:00'],
    [2026, 10, 24, '+02:00'],
    [2026, 10, 26, '+01:00'],
    [2026, 10, 27, '+01:00'],
    [2027, 3, 27, '+01:00'],
    [2027, 3, 29, '+02:00'],
  ] as const) {
    const t = instant(a, mo, j, 10)
    const p = partiesParis(t)
    assert.equal(p.heure, 10, `${a}-${mo}-${j}`)
    assert.equal(p.minute, 0)
    assert.equal(offsetParisIso(t), offset, `${a}-${mo}-${j}`)
  }
})

test('U1e — le piège du pas de 24 h : deux « 10:00 » consécutifs ne sont pas à 86 400 000 ms', () => {
  const samedi = instant(2026, 10, 24, 10)
  const lundi = instant(2026, 10, 26, 10)
  // 48 h de calendrier, 49 h de chronomètre : c’est exactement le bug que
  // `t += 86_400_000` fabriquerait en silence.
  assert.equal(lundi - samedi, 49 * 3_600_000)
  assert.notEqual(lundi - samedi, 48 * 3_600_000)
})

test('décalage Paris : +1 h l’hiver, +2 h l’été, et rien d’autre', () => {
  assert.equal(decalageParisMs(instant(2027, 1, 15, 12)), 3_600_000)
  assert.equal(decalageParisMs(instant(2027, 7, 15, 12)), 7_200_000)
})

test('minuit rend 00 et jamais 24 (hour12: false ⇒ hourCycle h23)', () => {
  const p = partiesParis(instant(2026, 11, 3, 0))
  assert.equal(p.heure, 0)
  assert.equal(p.ymd, '2026-11-03')
  assert.equal(formaterHeure(instant(2026, 11, 3, 0)), '00:00')
})

test('isoParis rend la forme canonique attendue par Brad', () => {
  const lundi = instant(2026, 9, 21, 10)
  assert.equal(partiesParis(lundi).isodow, 1, '21 septembre 2026 doit être un lundi')
  assert.equal(isoParis(lundi), '2026-09-21T10:00:00+02:00')
  assert.equal(isoParis(lundi + 3_600_000), '2026-09-21T11:00:00+02:00')
  const hiver = instant(2026, 12, 7, 18)
  assert.equal(isoParis(hiver), '2026-12-07T18:00:00+01:00')
})

test('isoParis est un aller-retour exact à la seconde près', () => {
  // Balayage dense autour des deux bascules, plus des instants ordinaires.
  const debuts = [
    instant(2026, 10, 23, 12),
    instant(2027, 3, 26, 12),
    instant(2026, 1, 1, 12),
    instant(2026, 6, 15, 12),
  ]
  let verifies = 0
  for (const debut of debuts) {
    for (let i = 0; i < 24 * 5; i++) {
      const t = debut + i * 3_600_000
      const iso = isoParis(t)
      assert.equal(Date.parse(iso), t, iso)
      const relu = analyserInstantParis(iso)
      assert.equal(relu.ok, true, iso)
      if (relu.ok) assert.equal(relu.ms, t)
      verifies++
    }
  }
  assert.equal(verifies, 480)
})

test('jour civil Paris : le bucket ne dérive pas au passage de la bascule', () => {
  assert.equal(jourParis(instant(2026, 10, 24, 10)), '2026-10-24')
  assert.equal(jourParis(instant(2026, 10, 25, 10)), '2026-10-25')
  assert.equal(jourParis(instant(2026, 10, 26, 10)), '2026-10-26')
  // 23:30 Paris le 24 est déjà le 25 en UTC : le bucket doit rester le 24.
  assert.equal(jourParis(instant(2026, 10, 24, 23, 30)), '2026-10-24')
})

test('joursCivils itère sur le calendrier, pas sur des instants', () => {
  assert.deepEqual(joursCivils('2026-10-23', '2026-10-27'), [
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
  ])
  // Passage d’année et de mois.
  assert.deepEqual(joursCivils('2026-12-30', '2027-01-02'), [
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
  ])
  // Année bissextile.
  assert.equal(joursCivils('2028-02-27', '2028-03-01').length, 4)
  // Borne unique.
  assert.deepEqual(joursCivils('2026-09-21', '2026-09-21'), ['2026-09-21'])
  // Intervalle inversé : vide, pas une boucle infinie.
  assert.deepEqual(joursCivils('2026-09-21', '2026-09-20'), [])
  assert.throws(() => joursCivils('2026-09-01', '2028-09-01'), /trop large/)
  assert.throws(() => joursCivils('21/09/2026', '2026-09-22'), /invalide/)
})

test('analyserJourCivil refuse les dates qui n’existent pas', () => {
  assert.deepEqual(analyserJourCivil('2026-09-21'), { annee: 2026, mois: 9, jour: 21 })
  assert.equal(analyserJourCivil('2027-02-29'), null)
  assert.equal(analyserJourCivil('2026-11-31'), null)
  assert.equal(analyserJourCivil('2026-13-01'), null)
  assert.equal(analyserJourCivil('2026-9-1'), null)
  assert.equal(analyserJourCivil(''), null)
})

test('Q9 — l’offset d’entrée est vérifié, pas seulement l’instant', () => {
  // Même instant, offset menteur : 11:00Z est le créneau de 13:00 à Paris.
  assert.deepEqual(analyserInstantParis('2026-09-22T11:00:00Z'), {
    ok: false,
    raison: 'offset',
  })
  assert.deepEqual(analyserInstantParis('2026-09-22T13:00:00+02:00'), {
    ok: true,
    ms: instant(2026, 9, 22, 13),
  })
  // Offset d’hiver appliqué à une date d’été : refusé.
  assert.deepEqual(analyserInstantParis('2026-09-22T13:00:00+01:00'), {
    ok: false,
    raison: 'offset',
  })
  // Formes non conformes.
  assert.deepEqual(analyserInstantParis('2026-09-22 13:00:00+02:00'), {
    ok: false,
    raison: 'format',
  })
  assert.deepEqual(analyserInstantParis('2026-09-22T13:00:00'), { ok: false, raison: 'format' })
  assert.deepEqual(analyserInstantParis('pas une date'), { ok: false, raison: 'format' })
})

test('formatage d’affichage en français, jamais utilisé comme clé', () => {
  const lundi = instant(2026, 9, 21, 10)
  assert.match(formaterJourLong(lundi), /lundi/)
  assert.match(formaterJourLong(lundi), /septembre/)
  assert.equal(formaterHeure(lundi), '10:00')
  assert.equal(formaterPlage(lundi, lundi + 3_600_000), '10:00 – 11:00')
})
