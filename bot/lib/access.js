'use strict';

const { logInfo, logWarn } = require('./logger');
const { isCoachAccessAction } = require('./slot-note');

async function callbackApp(job, payload) {
  const base = String(
    job.status_callback_base || process.env.COACH_APP_URL || process.env.SITE_URL || '',
  ).replace(/\/$/, '');
  const secret = String(process.env.SYNC_SECRET || '').trim();
  if (!base || !secret) {
    logWarn('Pas de callback app (COACH_APP_URL / SYNC_SECRET)');
    return false;
  }
  const url = `${base}/api/v1/internal/deciplus/callback`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) logWarn('Callback HTTP', { status: res.status, url });
    return res.ok;
  } catch (err) {
    logWarn('Callback échoué', { error: err.message });
    return false;
  }
}

/**
 * Grant / revoke Deciplus — robot Playwright (compte JUNIOR + IMAP jeremyfidge).
 *
 * `deps.runRpa` est injectable pour les tests. En prod : `./rpa`.runAccessJob
 * (login, fiche membre, note COACH-SLOT GRANT/REVOKE).
 */
async function processAccessJob(job, deps = {}) {
  const { isImapOtpConfigured, imapMissingReason } = require('./imap-otp');
  if (!isImapOtpConfigured()) {
    const err = new Error(imapMissingReason());
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }

  if (!isCoachAccessAction(job.action)) {
    throw new Error(`Action coach inconnue: ${job.action}`);
  }

  const runRpa = deps.runRpa || (await loadRpa());
  const reservationId = job.reservation_id || job.order_id;
  logInfo('Job Deciplus — RPA', {
    action: job.action,
    order_id: reservationId,
    club_id: job.club_id || job.gym,
  });

  const result = await runRpa(job);
  const status = result.status === 'granted' || result.status === 'revoked' ? result.status : 'error';

  await callbackApp(job, {
    reservation_id: reservationId,
    deciplus_member_id: result.deciplus_member_id || job.deciplus_member_id || null,
    job_status: status,
    club_id: job.club_id || job.gym || null,
    error: result.error || null,
  });

  return { status, action: result.action || job.action, deciplus_member_id: result.deciplus_member_id || null };
}

async function loadRpa() {
  try {
    return require('./rpa').runAccessJob;
  } catch (err) {
    const wrapped = new Error(
      `Playwright / RPA indisponible (${err.message}). cd bot && npm install && npx playwright install chromium`,
    );
    wrapped.code = 'RPA_UNAVAILABLE';
    throw wrapped;
  }
}

module.exports = { callbackApp, processAccessJob };
