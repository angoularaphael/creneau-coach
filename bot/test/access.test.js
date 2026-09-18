'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gymLabel, slotNote, identityFromJob, isCoachAccessAction, MARKER } = require('../lib/slot-note');
const { processAccessJob } = require('../lib/access');
const { normalizeJob } = require('../server');

test('coach_grant se normalise depuis grant + club_id', () => {
  const job = normalizeJob({
    action: 'grant',
    reservation_id: 'resa-1',
    club_id: 'minimes',
  });
  assert.equal(job.action, 'coach_grant');
  assert.equal(job.order_id, 'resa-1');
  assert.equal(job.club_id, 'minimes');
});

test('coach_revoke se normalise depuis revoke', () => {
  const job = normalizeJob({ action: 'revoke', order_id: 'resa-2', gym: 'portet' });
  assert.equal(job.action, 'coach_revoke');
  assert.equal(job.club_id, 'portet');
});

test('gymLabel mappe les 5 clubs Boxing Center', () => {
  assert.equal(gymLabel('minimes'), 'Minimes');
  assert.equal(gymLabel('st-cyprien'), 'St Cyprien');
  assert.equal(gymLabel('etats-unis'), 'Etats-Unis');
  assert.equal(gymLabel('ramonville'), 'Ramonville');
  assert.equal(gymLabel('portet'), 'Portet');
});

test('slotNote porte le marqueur COACH-SLOT et les bornes', () => {
  const note = slotNote(
    {
      order_id: 'abc',
      club_id: 'minimes',
      space_id: 'ring-1',
      qr_valid_from: '2026-09-18T08:00:00.000Z',
      qr_valid_to: '2026-09-18T09:00:00.000Z',
    },
    'GRANT',
  );
  assert.match(note, new RegExp(MARKER));
  assert.match(note, /GRANT/);
  assert.match(note, /abc/);
  assert.match(note, /minimes\/ring-1/);
});

test('identityFromJob lit customer', () => {
  const id = identityFromJob({
    customer: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '0600000000' },
  });
  assert.equal(id.first_name, 'Ada');
  assert.equal(id.email, 'ada@example.com');
});

test('isCoachAccessAction accepte grant et revoke', () => {
  assert.equal(isCoachAccessAction('coach_grant'), true);
  assert.equal(isCoachAccessAction('revoke'), true);
  assert.equal(isCoachAccessAction('sale'), false);
});

test('processAccessJob refuse sans IMAP', async () => {
  const prevUser = process.env.DECIPLUS_IMAP_USER;
  const prevPass = process.env.DECIPLUS_IMAP_PASS;
  process.env.DECIPLUS_IMAP_USER = '';
  process.env.DECIPLUS_IMAP_PASS = '';
  await assert.rejects(
    () => processAccessJob({ action: 'coach_grant', order_id: 'x' }),
    (err) => err.code === 'IMAP_NOT_CONFIGURED',
  );
  process.env.DECIPLUS_IMAP_USER = prevUser;
  process.env.DECIPLUS_IMAP_PASS = prevPass;
});

test('processAccessJob appelle le RPA et le callback quand IMAP est là', async () => {
  const prevUser = process.env.DECIPLUS_IMAP_USER;
  const prevPass = process.env.DECIPLUS_IMAP_PASS;
  const prevUrl = process.env.COACH_APP_URL;
  const prevSecret = process.env.SYNC_SECRET;
  process.env.DECIPLUS_IMAP_USER = 'jeremyfidge@gmail.com';
  process.env.DECIPLUS_IMAP_PASS = 'xxxx xxxx xxxx xxxx';
  process.env.COACH_APP_URL = '';
  process.env.SYNC_SECRET = '';

  let seen = null;
  const result = await processAccessJob(
    { action: 'coach_grant', reservation_id: 'resa-9', club_id: 'minimes' },
    {
      runRpa: async (job) => {
        seen = job;
        return { status: 'granted', deciplus_member_id: '42', action: 'coach_grant' };
      },
    },
  );
  assert.equal(result.status, 'granted');
  assert.equal(result.deciplus_member_id, '42');
  assert.equal(seen.reservation_id, 'resa-9');

  process.env.DECIPLUS_IMAP_USER = prevUser;
  process.env.DECIPLUS_IMAP_PASS = prevPass;
  process.env.COACH_APP_URL = prevUrl;
  process.env.SYNC_SECRET = prevSecret;
});
