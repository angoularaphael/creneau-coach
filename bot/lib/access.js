'use strict';

const { logInfo, logWarn, logError } = require('./logger');

async function callbackApp(job, payload) {
  const base = String(
    job.status_callback_base || process.env.COACH_APP_URL || process.env.SITE_URL || ''
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
 * Grant / revoke Deciplus.
 * IMAP (jeremyfidge) est le prérequis 2FA. Le RPA Playwright (fiche + note COACH-SLOT)
 * se branche ici dès que DECIPLUS_IMAP_PASS est en place.
 */
async function processAccessJob(job) {
  const { isImapOtpConfigured, imapMissingReason } = require('./imap-otp');
  if (!isImapOtpConfigured()) {
    const err = new Error(imapMissingReason());
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }

  logInfo('Job reçu — IMAP OK, RPA Deciplus à enchaîner', {
    action: job.action,
    order_id: job.order_id,
    club_id: job.club_id || job.gym,
  });

  await callbackApp(job, {
    reservation_id: job.reservation_id || job.order_id,
    deciplus_member_id: job.deciplus_member_id || null,
    job_status: 'queued_imap_ready',
    club_id: job.club_id || job.gym || null,
    note: 'IMAP jeremyfidge configuré — grant/revoke Playwright à brancher',
  });

  return { status: 'queued_imap_ready', action: job.action };
}

module.exports = { callbackApp, processAccessJob };
