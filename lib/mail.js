'use strict';

async function sendMail({ to, subject, html }) {
  const key = String(process.env.BREVO_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!key.startsWith('xkeysib-') || !to) return { skipped: true };
  const name = process.env.BREVO_SENDER_NAME || 'Boxing Center';
  const email = process.env.BREVO_SENDER_EMAIL || 'suzinabot@gmail.com';
  const reply = process.env.BREVO_REPLY_TO || process.env.DIRECTION_NOTIFY_EMAIL || 'boxingcenter31@gmail.com';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': key,
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name, email },
      to: [{ email: to }],
      replyTo: { email: reply, name },
      subject,
      htmlContent: html,
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
