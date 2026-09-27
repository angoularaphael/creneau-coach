'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  sharedMemberId,
  fenetreBadge,
  extraireUrlBadge,
  decisionTraitement,
} = require('../lib/badge-window');

const FROM = '2026-09-18T08:00:00.000Z';
const TO = '2026-09-18T09:00:00.000Z';

test('fenetreBadge : avant, pendant, après', () => {
  assert.equal(fenetreBadge('2026-09-18T07:59:59.000Z', FROM, TO), 'too_early');
  assert.equal(fenetreBadge('2026-09-18T08:00:00.000Z', FROM, TO), 'open');
  assert.equal(fenetreBadge('2026-09-18T08:30:00.000Z', FROM, TO), 'open');
  assert.equal(fenetreBadge('2026-09-18T09:00:00.000Z', FROM, TO), 'too_late');
  assert.equal(fenetreBadge('2026-09-18T09:01:00.000Z', FROM, TO), 'too_late');
  assert.equal(fenetreBadge('pas-une-date', FROM, TO), 'too_early');
});

test('sharedMemberId exige la fiche unique', () => {
  assert.equal(sharedMemberId({ DECIPLUS_SHARED_MEMBER_ID: '  88421  ' }), '88421');
  assert.throws(() => sharedMemberId({}), (err) => err.code === 'SHARED_MEMBER_MISSING');
  assert.throws(() => sharedMemberId({ DECIPLUS_SHARED_MEMBER_ID: '   ' }), (err) => err.code === 'SHARED_MEMBER_MISSING');
});

test('extraireUrlBadge lit le lien du badge, pas la fiche', () => {
  const page = [
    'https://boxingcenter.deciplus.pro/nextgen/legacy?path=%2Fjoueurs.php%3Fidj%3D12',
    'Code a rattacher https://boxingcenter.deciplus.pro/badge/enrol?c=6C419F5B',
  ].join('\n');
  assert.equal(
    extraireUrlBadge(page),
    'https://boxingcenter.deciplus.pro/badge/enrol?c=6C419F5B',
  );
  assert.equal(extraireUrlBadge('aucune adresse ici'), null);
  assert.equal(extraireUrlBadge('https://example.com/home'), null);
});

test('grant trop tot reste en attente, trop tard devient revoke', () => {
  const job = { action: 'coach_grant', qr_valid_from: FROM, qr_valid_to: TO };
  assert.equal(decisionTraitement(job, '2026-09-18T07:00:00.000Z'), 'wait');
  assert.equal(decisionTraitement(job, '2026-09-18T08:15:00.000Z'), 'sell');
  assert.equal(decisionTraitement(job, '2026-09-18T10:00:00.000Z'), 'revoke');
  assert.equal(decisionTraitement({ action: 'coach_revoke', qr_valid_from: FROM, qr_valid_to: TO }, FROM), 'revoke');
  assert.equal(decisionTraitement({ action: 'sale' }, FROM), 'unknown');
});
