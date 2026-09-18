'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');

function secret() {
  const s = String(process.env.QR_HMAC_SECRET || '').trim();
  if (!s || s.startsWith('change-me')) {
    throw new Error('QR_HMAC_SECRET manquant');
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function mintQrToken(reservation) {
  const payload = {
    jti: reservation.qr_jti || crypto.randomUUID(),
    club_id: reservation.club_id,
    nbf: Math.floor(new Date(reservation.qr_valid_from).getTime() / 1000),
    exp: Math.floor(new Date(reservation.qr_valid_to).getTime() / 1000),
  };
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(crypto.createHmac('sha256', secret()).update(`v1.${body}`).digest());
  return { token: `v1.${body}.${mac}`, jti: payload.jti, payload };
}

function hmacEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyQrToken(token, expectedClubId, now = new Date()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { ok: false, code: 'WEBHOOK_INVALID', message: 'Token QR illisible' };
  }
  const data = `v1.${parts[1]}`;
  const expected = b64url(crypto.createHmac('sha256', secret()).update(data).digest());
  if (!hmacEqual(parts[2], expected)) {
    return { ok: false, code: 'WEBHOOK_INVALID', message: 'HMAC QR faux' };
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch {
    return { ok: false, code: 'WEBHOOK_INVALID', message: 'Payload QR' };
  }
  if (expectedClubId && payload.club_id !== expectedClubId) {
    return { ok: false, code: 'QR_WRONG_CLUB', message: 'QR d’un autre club', payload };
  }
  const ts = Math.floor(now.getTime() / 1000);
  if (ts < Number(payload.nbf) || ts > Number(payload.exp)) {
    return { ok: false, code: 'QR_WINDOW_CLOSED', message: 'Hors fenêtre T−5 / fin de créneau', payload };
  }
  return { ok: true, payload };
}

function qrState(reservation, now = new Date()) {
  if (reservation.qr_revoked_at) return 'revoked';
  const from = new Date(reservation.qr_valid_from).getTime();
  const to = new Date(reservation.qr_valid_to).getTime();
  const t = now.getTime();
  if (t < from) return 'waiting';
  if (t > to) return 'expired';
  return 'active';
}

async function qrPngDataUrl(token) {
  return QRCode.toDataURL(token, { margin: 1, width: 280 });
}

function validityWindow(startsAt, endsAt, earlyMin = Number(process.env.QR_EARLY_MINUTES || 5)) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  return {
    qr_valid_from: new Date(start.getTime() - earlyMin * 60 * 1000).toISOString(),
    qr_valid_to: end.toISOString(),
  };
}

module.exports = {
  mintQrToken,
  verifyQrToken,
  qrState,
  qrPngDataUrl,
  validityWindow,
};
