'use strict';

async function sendMail({ to, subject, html }) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key || !to) return { skipped: true };
  const from =
    process.env.MAIL_FROM ||
    `${process.env.RESEND_SENDER_NAME || 'Boxing Center'} <${process.env.RESEND_SENDER_EMAIL || 'no-reply@boxingcenter.fr'}>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: process.env.RESEND_REPLY_TO || process.env.MAIL_REPLY_TO || undefined,
      subject,
      html,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

function mailSign(reservation) {
  const base = String(process.env.SITE_URL || '').replace(/\/$/, '');
  return sendMail({
    to: reservation.coach?.email,
    subject: 'Signe tes documents — Boxing Center',
    html: `<p>Paiement reçu. Signe CGV / règlement / décharge pour confirmer le créneau.</p>
           <p><a href="${base}/sign/${reservation.id}">Signer maintenant</a></p>`,
  });
}

function mailConfirmed(reservation) {
  const base = String(process.env.SITE_URL || '').replace(/\/$/, '');
  return sendMail({
    to: reservation.coach?.email,
    subject: 'Créneau confirmé — QR d’accès',
    html: `<p>Réservation confirmée (${reservation.club_id}, ${reservation.starts_at}).</p>
           <p>QR : <a href="${base}/api/v1/reservations/${reservation.id}/qr">afficher le QR</a></p>
           <p>Valide ${reservation.qr_valid_from} → ${reservation.qr_valid_to} (heure Paris).</p>`,
  });
}

module.exports = { sendMail, mailSign, mailConfirmed };
