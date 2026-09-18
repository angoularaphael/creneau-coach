'use strict';

const crypto = require('crypto');

const API_BASE = 'https://api.payplug.com/v1';
const API_VERSION = process.env.PAYPLUG_API_VERSION || '2019-08-06';

function secretKey() {
  const forceTest = String(process.env.PAYPLUG_FORCE_TEST || '').trim() === '1';
  if (forceTest && process.env.PAYPLUG_TEST_SECRET_KEY) return process.env.PAYPLUG_TEST_SECRET_KEY;
  return process.env.PAYPLUG_SECRET_KEY || process.env.PAYPLUG_TEST_SECRET_KEY || '';
}

function isPayplugEnabled() {
  return Boolean(secretKey());
}

function headers() {
  const key = secretKey();
  if (!key) throw new Error('PAYPLUG_SECRET_KEY manquante');
  return {
    Authorization: `Bearer ${key}`,
    'PayPlug-Version': API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const err = new Error(body.message || body.error || `Payplug HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function siteUrl() {
  return String(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3041').replace(
    /\/$/,
    ''
  );
}

async function createHostedPayment({ reservation, returnPath = '/pay/return' }) {
  const amount = Number(reservation.amount_cents);
  if (!Number.isFinite(amount) || amount < 100) throw new Error('Montant PayPlug invalide');
  const base = siteUrl();
  const billing = {
    first_name: reservation.coach?.first_name || 'Coach',
    last_name: reservation.coach?.last_name || 'Boxing',
    email: reservation.coach?.email || undefined,
    address1: reservation.coach?.address_line || 'Boxing Center',
    postcode: reservation.coach?.postal_code || '31000',
    city: reservation.coach?.city || 'Toulouse',
    country: 'FR',
    language: 'fr',
  };
  const payload = {
    amount,
    currency: 'EUR',
    billing,
    shipping: { ...billing, delivery_type: 'BILLING' },
    description: `Créneau ${reservation.club_id} ${reservation.starts_at || ''}`.slice(0, 80),
    metadata: {
      reservation_id: reservation.id,
      club_id: reservation.club_id,
      payment_plan: 'once',
    },
    notification_url: `${base}/api/v1/webhooks/payplug`,
    hosted_payment: {
      return_url: `${base}${returnPath}?id=${encodeURIComponent(reservation.id)}&payplug_return=1`,
      cancel_url: `${base}${returnPath}?id=${encodeURIComponent(reservation.id)}&cancelled=1`,
    },
  };
  return request('/payments', { method: 'POST', body: JSON.stringify(payload) });
}

function retrievePayment(paymentId) {
  return request(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

function isPayplugPaymentPaid(payment) {
  if (!payment || payment.failure) return false;
  if (payment.is_paid === true) return true;
  const authorizedAt = payment.authorization?.authorized_at || payment.authorized_at;
  const pending = payment.payment_method?.is_pending === true;
  return Boolean(authorizedAt) && !pending && payment.auto_capture !== false;
}

function verifyPayplugSignature(rawBody, signatureHeader, key = secretKey()) {
  const sig = String(signatureHeader || '').trim();
  if (!sig || !key) return false;
  const parts = sig.split('.');
  if (parts.length !== 3) return false;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', key).update(data).digest('base64url');
  const got = Buffer.from(parts[2]);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length) return false;
  return crypto.timingSafeEqual(got, exp);
}

function hostedPaymentUrl(payment) {
  return payment?.hosted_payment?.payment_url || null;
}

module.exports = {
  isPayplugEnabled,
  createHostedPayment,
  retrievePayment,
  isPayplugPaymentPaid,
  verifyPayplugSignature,
  hostedPaymentUrl,
  secretKey,
};
