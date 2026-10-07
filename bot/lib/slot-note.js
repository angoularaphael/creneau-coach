'use strict';

const CLUBS = {
  minimes: 'Minimes',
  'st-cyprien': 'St Cyprien',
  'saint-cyprien': 'St Cyprien',
  'etats-unis': 'Etats-Unis',
  ramonville: 'Ramonville',
  portet: 'Portet',
};

function gymLabel(clubId) {
  const slug = String(clubId || process.env.DECIPLUS_DEFAULT_SITE || 'minimes')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return CLUBS[slug] || process.env.DECIPLUS_DEFAULT_SITE || 'Minimes';
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
  parisStamp,
  slotNote,
  identityFromJob,
  isCoachAccessAction,
};
