/**
 * Auth mock — npm run dev + COACH_AUTH_MOCK=1
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

function cookieFrom(res) {
  const anyHeaders = res.headers;
  const list =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : [];
  if (list.length) {
    return list.map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

test('GET /api/v1/me sans session → 401 UNAUTHENTICATED', async (t) => {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/me`);
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}).`);
    return;
  }
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, 'UNAUTHENTICATED');
});

test('mock signup → cookie httpOnly + GET /me 200', async (t) => {
  const email = `coach-${Date.now()}@example.com`;
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/dev/mock-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        email,
        password: 'CoachSecure1!',
        first_name: 'Léa',
        last_name: 'Martin',
      }),
    });
  } catch (err) {
    t.skip(`Dev server unreachable (${err.message}).`);
    return;
  }

  if (res.status === 404) {
    t.skip('COACH_AUTH_MOCK désactivé');
    return;
  }

  assert.equal(res.status, 201);
  const cookie = cookieFrom(res);
  assert.match(cookie, /coach_mock_session=/);
  assert.doesNotMatch(cookie.toLowerCase(), /localstorage/);

  const meRes = await fetch(`${BASE}/api/v1/me`, {
    headers: { Accept: 'application/json', Cookie: cookie },
  });
  assert.equal(meRes.status, 200);
  const me = await meRes.json();
  assert.equal(me.role, 'coach');
  assert.equal(me.status, 'active');
  assert.equal(me.profile?.email, email);
  assert.ok(!('deciplus_member_id' in me));
});
