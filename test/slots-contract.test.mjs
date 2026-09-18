/**
 * DoD semaine 0 Brad : GET /clubs/:id/slots respecte le contrat OpenAPI
 * (même en mock). Lancer : npm run dev  puis  npm run test:slots
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';

test('GET /clubs/:id/slots — contrat mock', async (t) => {
  let res;
  try {
    res = await fetch(
      `${BASE}/clubs/minimes/slots?from=2026-09-21&to=2026-09-27`,
    );
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}). Run npm run dev.`);
    return;
  }

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.club_id, 'minimes');
  assert.ok(Array.isArray(body.slots));
  assert.ok(body.slots.length > 0);

  const slot = body.slots[0];
  for (const key of [
    'starts_at',
    'ends_at',
    'amount_cents',
    'tariff',
    'capacity',
    'taken',
    'state',
  ]) {
    assert.ok(key in slot, `missing ${key}`);
  }
  assert.ok([1000, 1500].includes(slot.amount_cents));
  assert.ok(['offpeak', 'peak'].includes(slot.tariff));
  assert.ok(['open', 'full', 'blocked', 'past'].includes(slot.state));
  assert.equal(typeof slot.starts_at, 'string');
  assert.ok(!('coach_name' in slot), 'public slots must not expose coach names');
});

test('GET /clubs/:id/slots — validation from/to', async (t) => {
  let res;
  try {
    res = await fetch(`${BASE}/clubs/portet/slots`);
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}).`);
    return;
  }
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});
