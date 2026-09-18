'use strict';

/**
 * Lit le code 2FA Deciplus dans Gmail (IMAP).
 * Boîte : jeremyfidge@gmail.com  →  DECIPLUS_IMAP_USER / DECIPLUS_IMAP_PASS
 */
const { logInfo, logWarn } = require('./logger');

function imapConfig() {
  const host = String(process.env.DECIPLUS_IMAP_HOST || 'imap.gmail.com').trim();
  const user = String(process.env.DECIPLUS_IMAP_USER || process.env.IMAP_USER || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  let pass = String(process.env.DECIPLUS_IMAP_PASS || process.env.IMAP_PASS || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (/gmail\.com$/i.test(host) && /^(?:[^\s]{4}\s){3}[^\s]{4}$/.test(pass)) {
    pass = pass.replace(/\s/g, '');
  }
  return {
    host,
    port: Number(process.env.DECIPLUS_IMAP_PORT || 993),
    user,
    pass,
  };
}

function isImapOtpConfigured() {
  const { user, pass } = imapConfig();
  return Boolean(user && pass);
}

function imapMissingReason() {
  const { user, pass } = imapConfig();
  if (!user) return 'DECIPLUS_IMAP_USER vide';
  if (!pass) {
    return (
      `IMAP pas encore branché pour ${user} : créer un mot de passe d’application Gmail ` +
      `(https://myaccount.google.com/apppasswords) puis DECIPLUS_IMAP_PASS=`
    );
  }
  return null;
}

function extractOtpCode(text = '') {
  const raw = String(text || '')
    .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
    .replace(/\s+/g, ' ');
  const afterHint = raw.match(/code\s+unique[^0-9]{0,80}(\d{3}\s*\d{3}|\d{6}|\d{4,8})/i);
  if (afterHint?.[1]) return afterHint[1].replace(/\s+/g, '');
  const labeled = raw.match(
    /(?:code|otp|validation|vérification|verification)[^0-9]{0,40}(\d{3}\s*\d{3}|\d{6})\b/i
  );
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, '');
  const spaced = raw.match(/(?<!\d)(\d{3})\s+(\d{3})(?!\d)/);
  if (spaced) return `${spaced[1]}${spaced[2]}`;
  const sixes = [...raw.matchAll(/(?<!\d)(\d{6})(?!\d)/g)].map((m) => m[1]);
  const notYear = sixes.find((c) => !/^20\d{2}/.test(c) && c !== '000000');
  return notYear || sixes[0] || null;
}

function looksLikeDeciplusOtpMail({ subject = '', from = '', text = '' } = {}) {
  const blob = `${subject}\n${from}\n${text}`.toLowerCase();
  if (/deciplus|xplor|boxing\s*center|boxingcenter/.test(blob)) return true;
  if (/(code|otp|vérification|verification|connexion|login|authent)/i.test(blob) && /\d{4,8}/.test(blob)) {
    return true;
  }
  return false;
}

function htmlToSafeText(html = '') {
  return String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|td|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

async function parseOtpMessage(source, envelope = {}) {
  const { simpleParser } = require('mailparser');
  const parsed = await simpleParser(source, { skipImageLinks: true });
  const subject = String(parsed.subject || envelope.subject || '');
  const from = String(
    parsed.from?.text || (envelope.from || []).map((item) => item.address || '').join(' ') || ''
  );
  const text = [parsed.text, htmlToSafeText(parsed.html)].filter(Boolean).join('\n');
  const matches = looksLikeDeciplusOtpMail({ subject, from, text });
  return { matches, code: matches ? extractOtpCode(`${subject}\n${text}`) : null };
}

function selectOtpMailboxes(boxes = []) {
  const selected = [];
  const add = (box, role) => {
    if (box && !selected.some((item) => item.path === box.path)) {
      selected.push({ path: box.path, role });
    }
  };
  add(
    boxes.find((box) => String(box.specialUse || '').toLowerCase() === '\\inbox') ||
      boxes.find((box) => String(box.path || '').toUpperCase() === 'INBOX'),
    'inbox'
  );
  add(
    boxes.find((box) => String(box.specialUse || '').toLowerCase() === '\\all') ||
      boxes.find((box) => /all mail|tous les messages/i.test(String(box.path || ''))),
    'all'
  );
  add(
    boxes.find((box) => String(box.specialUse || '').toLowerCase() === '\\junk') ||
      boxes.find((box) => /spam|junk|indésirables/i.test(String(box.path || ''))),
    'spam'
  );
  return selected;
}

async function connectImap() {
  const { ImapFlow } = require('imapflow');
  const cfg = imapConfig();
  if (!cfg.user || !cfg.pass) {
    const err = new Error(imapMissingReason());
    err.code = 'IMAP_NOT_CONFIGURED';
    throw err;
  }
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  return client;
}

async function testImapConnection() {
  const cfg = imapConfig();
  const client = await connectImap();
  try {
    const boxes = await client.list();
    const mailboxes = selectOtpMailboxes(boxes);
    const inbox = mailboxes.find((b) => b.role === 'inbox');
    let recent = 0;
    if (inbox) {
      const lock = await client.getMailboxLock(inbox.path);
      try {
        const uids = (await client.search({ since: new Date(Date.now() - 24 * 3600 * 1000) }, { uid: true })) || [];
        recent = uids.length;
      } finally {
        lock.release();
      }
    }
    return {
      ok: true,
      user: cfg.user,
      host: cfg.host,
      folders: mailboxes.map((b) => b.role),
      inbox_last_24h: recent,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

async function fetchDeciplusEmailCode(opts = {}) {
  if (!isImapOtpConfigured()) return null;
  const cfg = imapConfig();
  const maxWaitMs = Number(opts.maxWaitMs || process.env.DECIPLUS_OTP_WAIT_MS || 90000);
  const pollMs = Number(opts.pollMs || 4000);
  const sinceMs = Number(opts.sinceMs || 15 * 60 * 1000);
  const notBeforeMs = Number(opts.notBeforeMs || 0);
  const startedAt = Date.now();
  let attempt = 0;
  logInfo('Lecture IMAP du code Deciplus…', { user: cfg.user, host: cfg.host });

  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1;
    let client;
    try {
      client = await connectImap();
      for (const mailbox of selectOtpMailboxes(await client.list())) {
        const lock = await client.getMailboxLock(mailbox.path);
        try {
          const uids = (await client.search({ since: new Date(Date.now() - sinceMs) }, { uid: true })) || [];
          const dated = [];
          for await (const msg of client.fetch(uids, { uid: true, internalDate: true }, { uid: true })) {
            dated.push({ uid: msg.uid, date: msg.internalDate || new Date(0) });
          }
          dated.sort((a, b) => new Date(b.date) - new Date(a.date));
          for (const candidate of dated.slice(0, 20)) {
            const mailAt = new Date(candidate.date).getTime();
            if (notBeforeMs && mailAt + 5000 < notBeforeMs) continue;
            for await (const msg of client.fetch(
              candidate.uid,
              { uid: true, source: true, envelope: true, internalDate: true },
              { uid: true }
            )) {
              const parsed = await parseOtpMessage(msg.source, msg.envelope);
              if (parsed.matches && parsed.code) {
                logInfo('Code Deciplus trouvé via IMAP', { folder: mailbox.role, attempt });
                await client.logout().catch(() => {});
                return parsed.code;
              }
            }
          }
        } finally {
          lock.release();
        }
      }
      await client.logout().catch(() => {});
    } catch (err) {
      logWarn('IMAP tentative échouée', { attempt, error: err.message });
      try {
        await client?.logout();
      } catch {
        /* */
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

module.exports = {
  imapConfig,
  isImapOtpConfigured,
  imapMissingReason,
  extractOtpCode,
  fetchDeciplusEmailCode,
  testImapConnection,
};
