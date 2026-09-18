'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getReservation, getReservationByJti, upsertReservation, paymentSeen, markPayment } = require('./lib/store');
const payplug = require('./lib/payplug');
const paypal = require('./lib/paypal');
const qr = require('./lib/qr');
const { buildSignaturePdf } = require('./lib/signature-pdf');
const { enqueueCoachJob } = require('./lib/bot-forward');
const { mailSign, mailConfirmed } = require('./lib/mail');

const PORT = Number(process.env.PORT || 3041);
const SYNC = String(process.env.SYNC_SECRET || '').trim();

function jsonError(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, details: details || {} } });
}

function syncOk(req) {
  const header = String(req.headers['x-sync-secret'] || req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!SYNC || !header) return false;
  const a = crypto.createHash('sha256').update(header).digest();
  const b = crypto.createHash('sha256').update(SYNC).digest();
  return crypto.timingSafeEqual(a, b);
}

function markPaid(reservation, provider, paymentId) {
  return upsertReservation({
    ...reservation,
    payment_status: 'paid',
    payment_provider: provider,
    payment_id: paymentId,
    status: 'awaiting_signature',
    paid_at: new Date().toISOString(),
  });
}

async function confirmAndGrant(reservation) {
  const window = qr.validityWindow(reservation.starts_at, reservation.ends_at);
  const minted = qr.mintQrToken({
    ...reservation,
    ...window,
    qr_jti: reservation.qr_jti,
  });
  const next = upsertReservation({
    ...reservation,
    ...window,
    status: 'confirmed',
    signature_status: 'signed',
    signed_at: reservation.signed_at || new Date().toISOString(),
    qr_jti: minted.jti,
    qr_token: minted.token,
    deciplus_job_status: 'queued',
  });
  mailConfirmed(next).catch(() => {});
  try {
    await enqueueCoachJob('coach_grant', next);
  } catch (err) {
    upsertReservation({ ...next, deciplus_job_status: 'error', deciplus_error: err.message });
    throw err;
  }
  return next;
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use((req, res, next) => {
  if (req.path === '/api/v1/webhooks/payplug') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try {
        req.body = JSON.parse(req.rawBody.toString('utf8') || '{}');
      } catch {
        req.body = {};
      }
      next();
    });
    return;
  }
  express.json({ limit: '2mb' })(req, res, next);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/** En prod, l'API métier vit sur Next/Vercel. Express ne garde que health, webhooks et /internal. */
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || process.env.COACH_EXPRESS_LEGACY === '1') {
    return next();
  }
  const ouvert =
    req.path === '/health' ||
    req.path.startsWith('/api/v1/webhooks/') ||
    req.path.startsWith('/api/v1/internal/');
  if (ouvert) return next();
  return jsonError(res, 404, 'NOT_FOUND', 'Introuvable.');
});

app.use('/sign', express.static(path.join(__dirname, 'public')));

app.get('/sign/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sign.html'));
});

app.post('/api/v1/dev/seed-reservation', (req, res) => {
  if (!syncOk(req)) {
    return jsonError(res, 401, 'UNAUTHENTICATED', 'seed interdit');
  }
  const id = req.body.id || `resa-${Date.now()}`;
  const starts = req.body.starts_at || new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const ends = req.body.ends_at || new Date(new Date(starts).getTime() + 3600 * 1000).toISOString();
  const row = upsertReservation({
    id,
    status: 'held',
    payment_status: 'unpaid',
    signature_status: 'none',
    club_id: req.body.club_id || 'minimes',
    space_id: req.body.space_id || 'salle',
    starts_at: starts,
    ends_at: ends,
    amount_cents: Number(req.body.amount_cents || 1000),
    hold_expires_at: new Date(Date.now() + Number(process.env.HOLD_TTL_SECONDS || 600) * 1000).toISOString(),
    coach: req.body.coach || {
      first_name: 'Lea',
      last_name: 'Martin',
      email: 'lea@example.com',
      phone: '+33600000000',
      birth_date: '1990-01-02',
    },
  });
  res.status(201).json(row);
});

app.get('/api/v1/reservations/:id', (req, res) => {
  const row = getReservation(req.params.id);
  if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
  const { qr_token, ...safe } = row;
  res.json({ ...safe, qr_ready: Boolean(qr_token) && row.status === 'confirmed' });
});

app.post('/api/v1/reservations/:id/checkout', async (req, res) => {
  try {
    const row = getReservation(req.params.id);
    if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
    if (row.status === 'confirmed') {
      return jsonError(res, 409, 'CONFLICT', 'Déjà confirmée');
    }
    if (row.hold_expires_at && new Date(row.hold_expires_at) < new Date() && row.payment_status !== 'paid') {
      return jsonError(res, 409, 'HOLD_EXPIRED', 'Hold expiré');
    }
    const provider = String(req.body?.provider || 'payplug').toLowerCase();
    if (provider === 'credit') {
      return jsonError(res, 409, 'CONFLICT', 'Avoir : lot Junior (solde serveur)');
    }
    if (provider === 'paypal') {
      if (!paypal.isPaypalEnabled()) {
        return jsonError(res, 400, 'VALIDATION_ERROR', 'PayPal non configuré');
      }
      const created = await paypal.createOrder(row);
      upsertReservation({ ...row, payment_provider: 'paypal', payment_id: created.id });
      return res.json({
        reservation_id: row.id,
        provider: 'paypal',
        checkout_url: created.checkout_url,
        status: row.status,
      });
    }
    if (!payplug.isPayplugEnabled()) {
      return jsonError(res, 400, 'VALIDATION_ERROR', 'PayPlug non configuré');
    }
    const payment = await payplug.createHostedPayment({ reservation: row });
    upsertReservation({ ...row, payment_provider: 'payplug', payment_id: payment.id });
    return res.json({
      reservation_id: row.id,
      provider: 'payplug',
      checkout_url: payplug.hostedPaymentUrl(payment),
      status: row.status,
    });
  } catch (err) {
    return jsonError(res, 500, 'CONFLICT', err.message);
  }
});

app.post('/api/v1/webhooks/payplug', async (req, res) => {
  const sig = req.headers['payplug-signature'] || req.headers['PayPlug-Signature'];
  if (!payplug.verifyPayplugSignature(req.rawBody, sig)) {
    return jsonError(res, 401, 'WEBHOOK_INVALID', 'Signature Payplug refusée');
  }
  const paymentId = req.body?.id;
  if (!paymentId) return res.status(200).json({ ok: true, ignored: true });
  if (paymentSeen(paymentId)) return res.json({ ok: true, replay: true });
  let payment;
  try {
    payment = await payplug.retrievePayment(paymentId);
  } catch (err) {
    return jsonError(res, 401, 'WEBHOOK_INVALID', err.message);
  }
  const reservationId = String(payment.metadata?.reservation_id || '');
  const row = getReservation(reservationId);
  if (!row) return res.status(200).json({ ok: true, unknown_reservation: true });
  if (Number(payment.amount) !== Number(row.amount_cents)) {
    return jsonError(res, 409, 'PRICE_MISMATCH', 'Montant ≠ prix serveur', {
      paid: payment.amount,
      expected: row.amount_cents,
    });
  }
  if (payplug.isPayplugPaymentPaid(payment)) {
    markPayment(paymentId, row.id);
    const paid = markPaid(row, 'payplug', paymentId);
    mailSign(paid).catch(() => {});
    return res.json({ ok: true, status: paid.status });
  }
  if (payment.failure) {
    upsertReservation({ ...row, payment_status: 'failed', status: 'payment_failed' });
  }
  return res.json({ ok: true, pending: true });
});

app.post('/api/v1/webhooks/paypal', (_req, res) => {
  return jsonError(res, 401, 'WEBHOOK_INVALID', 'Webhook PayPal non branché (signature requise).');
});

app.post('/api/v1/reservations/:id/payment/sync', async (req, res) => {
  const row = getReservation(req.params.id);
  if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
  if (row.payment_status === 'paid') return res.json(row);
  if (row.payment_provider === 'payplug' && row.payment_id) {
    const payment = await payplug.retrievePayment(row.payment_id);
    if (Number(payment.amount) !== Number(row.amount_cents)) {
      return jsonError(res, 409, 'PRICE_MISMATCH', 'Montant ≠ prix serveur');
    }
    if (payplug.isPayplugPaymentPaid(payment)) {
      const paid = markPaid(row, 'payplug', payment.id);
      mailSign(paid).catch(() => {});
      return res.json(paid);
    }
  }
  if (row.payment_provider === 'paypal' && req.body?.token) {
    const cap = await paypal.captureOrder(req.body.token);
    const cents = paypal.paypalPaidCents(cap);
    if (cents != null && cents !== Number(row.amount_cents)) {
      return jsonError(res, 409, 'PRICE_MISMATCH', 'Montant ≠ prix serveur');
    }
    if (String(cap.status).toUpperCase() === 'COMPLETED') {
      const paid = markPaid(row, 'paypal', cap.id);
      mailSign(paid).catch(() => {});
      return res.json(paid);
    }
  }
  return res.json(row);
});

app.get('/api/v1/reservations/:id/documents', (req, res) => {
  const row = getReservation(req.params.id);
  if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
  if (row.payment_status !== 'paid' && row.payment_status !== 'waived_credit') {
    return jsonError(res, 409, 'PAYMENT_REQUIRED', 'Payer avant de signer');
  }
  res.json({
    documents: [
      { id: '00000000-0000-0000-0000-000000000001', kind: 'cgv', title: 'CGV', version: '1' },
      { id: '00000000-0000-0000-0000-000000000002', kind: 'reglement', title: 'Règlement intérieur', version: '1' },
      { id: '00000000-0000-0000-0000-000000000003', kind: 'decharge', title: 'Décharge', version: '1' },
    ],
  });
});

app.post('/api/v1/reservations/:id/signature', async (req, res) => {
  try {
    const row = getReservation(req.params.id);
    if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
    if (row.payment_status !== 'paid' && row.payment_status !== 'waived_credit') {
      return jsonError(res, 409, 'PAYMENT_REQUIRED', 'Payer avant de signer');
    }
    if (req.body?.consent !== true) {
      return jsonError(res, 400, 'VALIDATION_ERROR', 'consent obligatoire');
    }
    const img = String(req.body?.signature_image || '');
    if (!img.startsWith('data:image')) {
      return jsonError(res, 400, 'VALIDATION_ERROR', 'signature_image PNG requis');
    }
    const pdf = await buildSignaturePdf(row, {
      signatureImage: img,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const signed = upsertReservation({
      ...row,
      signature_status: 'signed',
      signed_at: new Date().toISOString(),
      signature_pdf_path: pdf.path,
      signature_sha256: pdf.sha256,
    });
    const confirmed = await confirmAndGrant(signed);
    const { qr_token, ...safe } = confirmed;
    res.json({ ...safe, qr_ready: true });
  } catch (err) {
    return jsonError(res, 500, 'CONFLICT', err.message);
  }
});

app.get('/api/v1/reservations/:id/qr', async (req, res) => {
  try {
    const row = getReservation(req.params.id);
    if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
    if (row.status !== 'confirmed' || !row.qr_token) {
      if (row.payment_status !== 'paid') return jsonError(res, 409, 'PAYMENT_REQUIRED', 'Pas encore payé');
      return jsonError(res, 409, 'SIGNATURE_REQUIRED', 'Signer avant le QR');
    }
    const png = await qr.qrPngDataUrl(row.qr_token);
    res.json({
      png_data_url: png,
      valid_from: row.qr_valid_from,
      valid_to: row.qr_valid_to,
      club_id: row.club_id,
      state: qr.qrState(row),
    });
  } catch (err) {
    return jsonError(res, 500, 'CONFLICT', err.message);
  }
});

app.post('/api/v1/internal/access/verify', (req, res) => {
  if (!syncOk(req)) return jsonError(res, 401, 'UNAUTHENTICATED', 'secret');
  const result = qr.verifyQrToken(req.body?.token, req.body?.club_id);
  if (!result.ok) {
    const status = result.code === 'QR_WINDOW_CLOSED' ? 410 : result.code === 'QR_WRONG_CLUB' ? 422 : 401;
    return jsonError(res, status, result.code, result.message);
  }
  const match = getReservationByJti(result.payload.jti);
  if (!match || match.status !== 'confirmed') {
    return jsonError(res, 404, 'NOT_FOUND', 'Réservation QR inconnue');
  }
  res.json({ ok: true, reservation_id: match.id, coach_id: match.coach_id || match.coach?.email });
});

app.post('/api/v1/internal/deciplus/jobs', async (req, res) => {
  if (!syncOk(req)) return jsonError(res, 401, 'UNAUTHENTICATED', 'secret');
  const row = getReservation(req.body.reservation_id);
  if (!row && req.body.action !== 'revoke_coach') {
    return jsonError(res, 404, 'NOT_FOUND', 'Réservation introuvable');
  }
  try {
    const queued = await enqueueCoachJob(req.body.action, row || { id: req.body.reservation_id, club_id: 'minimes' }, {
      deciplus_member_id: req.body.deciplus_member_id,
      coach_id: req.body.coach_id,
    });
    res.status(202).json(queued);
  } catch (err) {
    jsonError(res, 502, 'CONFLICT', err.message);
  }
});

app.post('/api/v1/internal/deciplus/callback', (req, res) => {
  if (!syncOk(req)) return jsonError(res, 401, 'UNAUTHENTICATED', 'secret');
  const id = req.body.reservation_id;
  const row = getReservation(id);
  if (!row) return res.json({ ok: true, unknown: true });
  upsertReservation({
    ...row,
    deciplus_member_id: req.body.deciplus_member_id || row.deciplus_member_id,
    deciplus_job_status: req.body.job_status || row.deciplus_job_status,
    deciplus_error: req.body.error || null,
  });
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[coach-reservation] API Express → :${PORT}`);
});
