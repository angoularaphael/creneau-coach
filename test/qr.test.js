'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('QR HMAC : fenêtre + club', () => {
  process.env.QR_HMAC_SECRET = 'unit-test-secret-qr-hmac-32chars!!';
  const { mintQrToken, verifyQrToken } = require('../lib/qr');
  const now = new Date('2026-09-22T11:00:00+02:00');
  const { token } = mintQrToken({
    qr_jti: 'jti-1',
    club_id: 'portet',
    qr_valid_from: '2026-09-22T10:55:00+02:00',
    qr_valid_to: '2026-09-22T12:00:00+02:00',
  });
  assert.equal(verifyQrToken(token, 'portet', now).ok, true);
  assert.equal(verifyQrToken(token, 'minimes', now).code, 'QR_WRONG_CLUB');
  const early = new Date('2026-09-22T10:50:00+02:00');
  assert.equal(verifyQrToken(token, 'portet', early).code, 'QR_WINDOW_CLOSED');
});
