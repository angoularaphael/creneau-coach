'use strict';

function botUrl() {
  return String(process.env.COACH_BOT_URL || 'http://prem-eu4.bot-hosting.net:20695').replace(/\/$/, '');
}

function secret() {
  return String(process.env.SYNC_SECRET || '').trim();
}

async function enqueueCoachJob(action, reservation, extra = {}) {
  const url = `${botUrl()}/api/jobs`;
  const body = {
    action,
    order_id: reservation.id,
    reservation_id: reservation.id,
    club_id: reservation.club_id,
    gym: reservation.club_id,
    space_id: reservation.space_id,
    qr_valid_from: reservation.qr_valid_from,
    qr_valid_to: reservation.qr_valid_to,
    starts_at: reservation.starts_at,
    ends_at: reservation.ends_at,
    deciplus_member_id: reservation.deciplus_member_id || null,
    status_callback_base: String(process.env.SITE_URL || '').replace(/\/$/, ''),
    customer: {
      first_name: reservation.coach?.first_name,
      last_name: reservation.coach?.last_name,
      email: reservation.coach?.email,
      phone: reservation.coach?.phone,
      birth_date: reservation.coach?.birth_date,
      address: reservation.coach?.address_line,
      postal_code: reservation.coach?.postal_code,
      city: reservation.coach?.city,
    },
    ...extra,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': secret(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || `Bot HTTP ${res.status}`);
    err.body = json;
    throw err;
  }
  return json;
}

module.exports = { enqueueCoachJob, botUrl };
