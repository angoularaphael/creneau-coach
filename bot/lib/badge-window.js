'use strict';

/**
 * Fiche Deciplus unique (COACHING SOUS LOC) et fenêtre du badge.
 * La vente n'a lieu que pendant le créneau. Avant : le job reste en file.
 * Après : on ne vend pas, on révoque.
 */

function sharedMemberId(env = process.env) {
  const id = String(env.DECIPLUS_SHARED_MEMBER_ID || '').trim();
  if (!id) {
    const err = new Error('DECIPLUS_SHARED_MEMBER_ID manquant — fiche unique requise');
    err.code = 'SHARED_MEMBER_MISSING';
    throw err;
  }
  return id;
}

function fenetreBadge(now, from, to) {
  const n = new Date(now).getTime();
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(n) || !Number.isFinite(a) || !Number.isFinite(b)) return 'too_early';
  if (n < a) return 'too_early';
  if (n >= b) return 'too_late';
  return 'open';
}

function urlsDans(texte) {
  const matches = String(texte || '').match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const out = [];
  for (const raw of matches) {
    const propre = raw.replace(/[),.;]+$/g, '');
    try {
      const u = new URL(propre);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      out.push(u);
    } catch {
      /* fragment illisible */
    }
  }
  return out;
}

/**
 * URL à encoder dans le QR. On ne fabrique rien : seulement un lien déjà
 * présent, qui ressemble à un ticket / badge, ou une page Deciplus qui
 * n'est pas l'écran de saisie.
 */
function extraireUrlBadge(texte) {
  const liste = urlsDans(texte);
  const ticket = liste.find((u) => /badge|ticket|qr|enrol|enroll|access|acces|decipass/i.test(`${u.pathname}${u.search}`));
  if (ticket) return ticket.toString();
  const deciplus = liste.find((u) => {
    if (!/deciplus|xplor|lodecom/i.test(u.hostname)) return false;
    if (/joueurs\.php|select\.php|login|choose-zone/i.test(`${u.pathname}${u.search}`)) return false;
    return true;
  });
  return deciplus ? deciplus.toString() : null;
}

function estGrant(action) {
  const a = String(action || '').toLowerCase();
  return a === 'coach_grant' || a === 'grant';
}

function estRevoke(action) {
  const a = String(action || '').toLowerCase();
  return ['coach_revoke', 'revoke', 'coach_revoke_coach', 'revoke_coach'].includes(a);
}

/** @returns {'wait'|'sell'|'revoke'|'unknown'} */
function decisionTraitement(job, now = new Date()) {
  if (estRevoke(job && job.action)) return 'revoke';
  if (!estGrant(job && job.action)) return 'unknown';
  const from = job.qr_valid_from || job.valid_from || job.starts_at;
  const to = job.qr_valid_to || job.valid_to || job.ends_at;
  const fenetre = fenetreBadge(now, from, to);
  if (fenetre === 'too_early') return 'wait';
  if (fenetre === 'too_late') return 'revoke';
  return 'sell';
}

module.exports = {
  sharedMemberId,
  fenetreBadge,
  extraireUrlBadge,
  decisionTraitement,
};
