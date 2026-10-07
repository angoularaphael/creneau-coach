'use strict';

const CLUBS = {
  minimes: 'Minimes',
  'st-cyprien': 'St Cyprien',
  'saint-cyprien': 'St Cyprien',
  'etats-unis': 'Etats-Unis',
  ramonville: 'Ramonville',
  portet: 'Portet',
};

function normaliserLibelleSite(valeur) {
  return String(valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bst\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bboxing center\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sitesCorrespondent(a, b) {
  const x = normaliserLibelleSite(a);
  const y = normaliserLibelleSite(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function gymLabel(clubId) {
  const slug = String(clubId || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  const label = CLUBS[slug];
  if (!label) {
    const err = new Error(`Club Deciplus inconnu: ${clubId || '(vide)'} — vente refusee`);
    err.code = 'CLUB_INCONNU';
    throw err;
  }
  return label;
}

function parisStamp(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  } catch {
    return String(iso || '');
  }
}

const MARKER = 'COACH-SLOT';

function slotNote(order, verb) {
  const club = order.gym || order.club_id || '';
  const space = order.space_id || '';
  const from = parisStamp(order.qr_valid_from || order.valid_from || order.starts_at);
  const to = parisStamp(order.qr_valid_to || order.valid_to || order.ends_at);
  return `${MARKER} ${verb} ${order.order_id || order.reservation_id} ${club}/${space} ${from} → ${to}`.slice(
    0,
    480,
  );
}

function identityFromJob(job) {
  const c = job.customer || {};
  return {
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    email: c.email || '',
    phone: c.phone || '',
    birth_date: c.birth_date || c.birthdate || '',
    address: c.address || c.address_line || '',
    postal_code: c.postal_code || '',
    city: c.city || '',
  };
}

function isCoachAccessAction(action) {
  const a = String(action || '').toLowerCase();
  return [
    'coach_grant',
    'coach_revoke',
    'coach_revoke_coach',
    'grant',
    'revoke',
    'revoke_coach',
  ].includes(a);
}

module.exports = {
  CLUBS,
  MARKER,
  gymLabel,
  normaliserLibelleSite,
  sitesCorrespondent,
  parisStamp,
  slotNote,
  identityFromJob,
  isCoachAccessAction,
};
