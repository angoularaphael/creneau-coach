#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { logInfo, logWarn, logError } = require('./lib/logger');
const { listPending, markDone } = require('./lib/queue');
const { processAccessJob } = require('./lib/access');
const { isImapOtpConfigured, imapMissingReason } = require('./lib/imap-otp');

const POLL_MS = Number(process.env.BOT_POLL_MS || 5000);

async function tick() {
  const pending = listPending();
  if (!pending.length) return;
  if (!isImapOtpConfigured()) {
    logWarn('Jobs en attente — IMAP pas encore fait', {
      pending: pending.length,
      reason: imapMissingReason(),
    });
    return;
  }
  for (const job of pending) {
    try {
      logInfo('Traitement job', { job_id: job.job_id, action: job.action });
      const result = await processAccessJob(job);
      markDone(job.file, { result, status: result.status || 'success' });
    } catch (err) {
      if (err.code === 'IMAP_NOT_CONFIGURED') {
        logWarn(err.message);
        return;
      }
      logError('Job échoué', { job_id: job.job_id, error: err.message });
      markDone(job.file, { status: 'error', error: err.message });
    }
  }
}

async function main() {
  logInfo('Worker créneau coachs', {
    seller: process.env.DECIPLUS_USER || 'JUNIOR',
    imap: isImapOtpConfigured() ? 'ok' : imapMissingReason(),
  });
  await tick();
  setInterval(() => {
    tick().catch((err) => logError('tick', { error: err.message }));
  }, POLL_MS);
}

module.exports = { main, tick };

if (require.main === module) {
  main().catch((err) => {
    logError('Worker crash', { error: err.message });
    process.exit(1);
  });
}
