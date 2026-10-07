#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { startHttpServer } = require('./server');
const { main: startWorker } = require('./worker');
const { isImapOtpConfigured, imapConfig, imapMissingReason } = require('./lib/imap-otp');
const { logInfo, logWarn } = require('./lib/logger');

async function start() {
  const cfg = imapConfig();
  logInfo('Démarrage bot créneaux', {
    seller: process.env.DECIPLUS_USER || 'JUNIOR',
    port: process.env.BOT_HTTP_PORT || process.env.PORT || '20695',
    imap_user: cfg.user || '(vide)',
    imap: isImapOtpConfigured() ? 'prêt' : 'à faire',
  });
  if (!isImapOtpConfigured()) {
    logWarn(imapMissingReason());
  }
  if (!String(process.env.SYNC_SECRET || '').trim()) {
    logWarn('SYNC_SECRET vide — POST /api/jobs refusera les jobs (même secret que l’app)');
  }
  await startHttpServer();
  await startWorker();
}

start().catch((err) => {
  console.error('[creneau-bot] start failed', err);
  process.exit(1);
});
