'use strict';

const { stats, enqueue, listPending } = require('./lib/queue');
const { isImapOtpConfigured, imapConfig, imapMissingReason } = require('./lib/imap-otp');

function secret() {
  return String(process.env.SYNC_SECRET || '').trim();
}

function isAuthorized(req) {
  const expected = secret();
  if (!expected) return false;
  const header = req.headers['x-sync-secret'] || req.headers['authorization'] || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  return token === expected;
}

function normalizeJob(body = {}) {
  const action = String(body.action || 'coach_grant').toLowerCase();
  const mapped =
    action === 'grant' || action === 'coach_access_grant'
      ? 'coach_grant'
      : action === 'revoke' || action === 'coach_access_revoke'
        ? 'coach_revoke'
        : action;
  return {
    ...body,
    action: mapped,
    order_id: body.order_id || body.reservation_id,
    reservation_id: body.reservation_id || body.order_id,
    club_id: body.club_id || body.gym,
  };
}

function createBotServer() {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    const cfg = imapConfig();
    res.json({
      ok: true,
      ready: Boolean(secret()),
      service: 'creneau-coach-bot',
      bot_id: process.env.BOT_ID || 'junior-coach',
      bot_role: process.env.BOT_ROLE || 'coach-access',
      seller: process.env.DECIPLUS_USER || 'JUNIOR',
      imap: {
        configured: isImapOtpConfigured(),
        user: cfg.user || null,
        host: cfg.host,
        missing: imapMissingReason(),
      },
      sync_secret: Boolean(secret()),
      stats: stats(),
    });
  });

  app.post('/api/jobs', (req, res) => {
    if (!secret()) {
      return res.status(503).json({ ok: false, error: 'SYNC_SECRET manquant sur le bot' });
    }
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const job = normalizeJob(req.body || {});
    if (!job.order_id) {
      return res.status(400).json({ ok: false, error: 'order_id / reservation_id requis' });
    }
    if (!['coach_grant', 'coach_revoke', 'coach_revoke_coach'].includes(job.action)) {
      return res.status(400).json({ ok: false, error: `action inconnue: ${job.action}` });
    }
    const result = enqueue(job);
    res.json({ ok: true, ...result, imap_ready: isImapOtpConfigured() });
  });

  app.get('/api/queue/stats', (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    res.json({ ok: true, ...stats(), pending: listPending().length });
  });

  return app;
}

function startHttpServer() {
  const port = Number(process.env.BOT_HTTP_PORT || process.env.PORT || 20695);
  const app = createBotServer();
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`[creneau-bot] HTTP :${port}  health=/health  jobs=POST /api/jobs`);
      resolve(server);
    });
  });
}

module.exports = { createBotServer, startHttpServer, normalizeJob };
