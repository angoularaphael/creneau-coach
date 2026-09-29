'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bornesVenteBadge } = require('../lib/badge-vente');

test('créneau d été : 10:00-11:00 Paris, 60 minutes', () => {
  const bornes = bornesVenteBadge({
    starts_at: '2026-09-29T08:00:00.000Z',
    ends_at: '2026-09-29T09:00:00.000Z',
    qr_valid_from: '2026-09-29T07:55:00.000Z',
    qr_valid_to: '2026-09-29T09:00:00.000Z',
  });
  assert.equal(bornes.debutFr, '29/09/2026 10:00');
  assert.equal(bornes.finFr, '29/09/2026 11:00');
  assert.equal(bornes.dureeMinutes, 60);
});

test('créneau d hiver : 18:00-19:00 Paris, 60 minutes', () => {
  const bornes = bornesVenteBadge({
    starts_at: '2026-01-15T17:00:00.000Z',
    ends_at: '2026-01-15T18:00:00.000Z',
  });
  assert.equal(bornes.debutFr, '15/01/2026 18:00');
  assert.equal(bornes.finFr, '15/01/2026 19:00');
  assert.equal(bornes.dureeMinutes, 60);
});

test('la durée suit ends_at, même si le créneau n est pas d une heure', () => {
  const bornes = bornesVenteBadge({
    reservation: {
      starts_at: '2026-09-29T08:00:00.000Z',
      ends_at: '2026-09-29T09:30:00.000Z',
    },
  });
  assert.equal(bornes.dureeMinutes, 90);
  assert.equal(bornes.finFr, '29/09/2026 11:30');
});

test('sans dates de créneau, pas de vente', () => {
  assert.throws(
    () => bornesVenteBadge({ qr_valid_from: '2026-09-29T08:00:00.000Z' }),
    (err) => err.code === 'BADGE_CRENEAU_ABSENT',
  );
  assert.throws(
    () =>
      bornesVenteBadge({
        starts_at: '2026-09-29T09:00:00.000Z',
        ends_at: '2026-09-29T08:00:00.000Z',
      }),
    (err) => err.code === 'BADGE_DUREE_INVALIDE',
  );
});
