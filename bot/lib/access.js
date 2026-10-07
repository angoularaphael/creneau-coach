'use strict';

const { logInfo, logWarn } = require('./logger');
const { isCoachAccessAction } = require('./slot-note');
const { decisionTraitement } = require('./badge-window');

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
 * Grant / revoke Deciplus — robot Playwright (compte RAPHAEL + IMAP jeremyfidge).
 *
 * `deps.runRpa` est injectable pour les tests. En prod : `./rpa`.runAccessJob
 * (login, fiche membre, note COACH-SLOT GRANT/REVOKE).
 */
async function processAccessJob(job, deps = {}) {
  const now = deps.now ? new Date(deps.now) : new Date();
  const decision = decisionTraitement(job, now);
  if (decision === 'wait') {
    logInfo('Job trop tôt — reste en file', {
      order_id: job.reservation_id || job.order_id,
      qr_valid_from: job.qr_valid_from || job.starts_at || null,
    });
    return { status: 'waiting', action: job.action, deciplus_member_id: null };
  }
  if (decision === 'unknown' || !isCoachAccessAction(job.action)) {
    throw new Error(`Action coach inconnue: ${job.action}`);
  }

  const effectif = decision === 'revoke' ? { ...job, action: 'coach_revoke' } : job;

  const { isImapOtpConfigured, imapMissingReason } = require('./imap-otp');
  if (!isImapOtpConfigured()) {
    const err = new Error(imapMissingReason());
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }

  const runRpa = deps.runRpa || (await loadRpa());
  const reservationId = effectif.reservation_id || effectif.order_id;
  logInfo('Job Deciplus — RPA', {
    action: effectif.action,
    order_id: reservationId,
    club_id: effectif.club_id || effectif.gym,
  });

  const result = await runRpa(effectif);
  const status = result.status === 'granted' || result.status === 'revoked' ? result.status : 'error';

  await callbackApp(effectif, {
    reservation_id: reservationId,
    deciplus_member_id: result.deciplus_member_id || null,
    job_status: status,
    club_id: effectif.club_id || effectif.gym || null,
    error: result.error || null,
    access_url: result.access_url || null,
    fiche_partagee: result.fiche_partagee === true,
  });

  return {
    status,
    action: result.action || effectif.action,
    deciplus_member_id: result.deciplus_member_id || null,
    access_url: result.access_url || null,
  };
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
