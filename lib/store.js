'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.COACH_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'reservations.json');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ reservations: {}, used_payments: {} }, null, 2));
}

function load() {
  ensure();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getReservation(id) {
  return load().reservations[id] || null;
}

function upsertReservation(row) {
  const data = load();
  const prev = data.reservations[row.id] || {};
  const next = { ...prev, ...row, updated_at: new Date().toISOString() };
  data.reservations[row.id] = next;
  save(data);
  return next;
}

function paymentSeen(paymentId) {
  const data = load();
  return Boolean(data.used_payments[paymentId]);
}

function markPayment(paymentId, reservationId) {
  const data = load();
  data.used_payments[paymentId] = { reservation_id: reservationId, at: new Date().toISOString() };
  save(data);
}

function getReservationByJti(jti) {
  const wanted = String(jti || '');
  const data = load();
  return Object.values(data.reservations || {}).find((r) => r.qr_jti === wanted) || null;
}

module.exports = {
  getReservation,
  getReservationByJti,
  upsertReservation,
  paymentSeen,
  markPayment,
  DATA_DIR,
};
