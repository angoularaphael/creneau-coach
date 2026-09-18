/**
 * Tunnel Lot B (mock) — npm run dev + COACH_AUTH_MOCK=1
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

function cookieFrom(res) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
  if (list.length) return list.map((c) => c.split(';')[0]).join('; ');
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

async function signup() {
  const email = `tunnel-${Date.now()}@example.com`;
  const res = await fetch(`${BASE}/api/v1/dev/mock-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: 'signup',
      email,
      password: 'CoachSecure1!',
      first_name: 'Tunnel',
      last_name: 'Test',
    }),
  });
  if (res.status === 404) return null;
  assert.equal(res.status, 201);
  return cookieFrom(res);
}

test('tunnel hold → checkout → sync → signature → qr', async (t) => {
  let cookie;
  try {
    cookie = await signup();
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}).`);
    return;
  }
  if (!cookie) {
    t.skip('COACH_AUTH_MOCK off');
    return;
  }

  const slotsRes = await fetch(
    `${BASE}/api/v1/clubs/minimes/slots?from=2026-09-21&to=2026-09-21`,
  );
  const slotsBody = await slotsRes.json();
  const open = slotsBody.slots.find((s) => s.state === 'open');
  assert.ok(open, 'need an open slot');

  const holdRes = await fetch(`${BASE}/api/v1/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: cookie,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      club_id: 'minimes',
      space_id: 'salle',
      starts_at: open.starts_at,
    }),
  });
  assert.equal(holdRes.status, 201);
  const hold = await holdRes.json();
  assert.equal(hold.status, 'held');
  assert.equal(hold.amount_cents, open.amount_cents);

  const checkoutRes = await fetch(
    `${BASE}/api/v1/reservations/${hold.id}/checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ provider: 'payplug' }),
    },
  );
  assert.equal(checkoutRes.status, 200);
  const checkout = await checkoutRes.json();
  assert.ok(checkout.checkout_url);

  const syncRes = await fetch(
    `${BASE}/api/v1/reservations/${hold.id}/payment/sync`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', Cookie: cookie },
    },
  );
  assert.equal(syncRes.status, 200);
  const paid = await syncRes.json();
  assert.equal(paid.status, 'awaiting_signature');
  assert.equal(paid.payment_status, 'paid');

  const signRes = await fetch(
    `${BASE}/api/v1/reservations/${hold.id}/signature`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        consent: true,
        signature_image: 'data:image/png;base64,aaa',
        document_ids: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003',
        ],
      }),
    },
  );
  assert.equal(signRes.status, 200);
  const signed = await signRes.json();
  assert.equal(signed.status, 'confirmed');
  assert.equal(signed.qr_ready, true);

  const qrEarly = await fetch(`${BASE}/api/v1/reservations/${hold.id}/qr`, {
    headers: { Cookie: cookie },
  });
  // confirmed → 200 even if window waiting
  assert.equal(qrEarly.status, 200);
  const qr = await qrEarly.json();
  assert.ok(qr.png_data_url);
  assert.equal(qr.club_id, 'minimes');
});

test('POST /contact 204', async (t) => {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Brad',
        email: 'brad@example.com',
        message: 'Test contact Lot B',
      }),
    });
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}).`);
    return;
  }
  assert.equal(res.status, 204);
});
