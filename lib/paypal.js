'use strict';

function paypalBase() {
  const mode = String(process.env.PAYPAL_MODE || process.env.PAYPAL_TEST_MODE || 'sandbox').toLowerCase();
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function clientId() {
  const sandbox = String(process.env.PAYPAL_MODE || 'sandbox') !== 'live';
  return sandbox
    ? process.env.PAYPAL_TEST_CLIENT_ID || process.env.PAYPAL_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID;
}

function clientSecret() {
  const sandbox = String(process.env.PAYPAL_MODE || 'sandbox') !== 'live';
  return sandbox
    ? process.env.PAYPAL_TEST_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_CLIENT_SECRET;
}

function isPaypalEnabled() {
  return Boolean(clientId() && clientSecret());
}

async function accessToken() {
  const creds = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error_description || 'PayPal OAuth');
  return json.access_token;
}

async function createOrder(reservation) {
  const token = await accessToken();
  const base = String(process.env.SITE_URL || 'http://localhost:3041').replace(/\/$/, '');
  const amount = (Number(reservation.amount_cents) / 100).toFixed(2);
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: reservation.id,
          amount: { currency_code: 'EUR', value: amount },
          description: `Créneau coach ${reservation.club_id}`.slice(0, 120),
        },
      ],
      application_context: {
        return_url: `${base}/pay/return?id=${encodeURIComponent(reservation.id)}&paypal_return=1`,
        cancel_url: `${base}/pay/return?id=${encodeURIComponent(reservation.id)}&cancelled=1`,
        user_action: 'PAY_NOW',
      },
    }),
  });
  const json = await res.json();
  const approve = (json.links || []).find((l) => l.rel === 'approve');
  return { id: json.id, checkout_url: approve?.href, raw: json };
}

async function captureOrder(orderId) {
  const token = await accessToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

function paypalPaidCents(capture) {
  const unit = capture?.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const value = cap?.amount?.value || unit?.amount?.value;
  if (!value) return null;
  return Math.round(Number(value) * 100);
}

module.exports = {
  isPaypalEnabled,
  createOrder,
  captureOrder,
  paypalPaidCents,
};
