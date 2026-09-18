'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { DATA_DIR } = require('./store');

const SIG_DIR = path.join(DATA_DIR, 'signatures');

function ensureDir() {
  fs.mkdirSync(SIG_DIR, { recursive: true });
}

function buildSignaturePdf(reservation, { signatureImage, ip, userAgent }) {
  ensureDir();
  const dest = path.join(SIG_DIR, `${reservation.id}.pdf`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const out = fs.createWriteStream(dest);
    doc.pipe(out);
    doc.fillColor('#0B1F3A').fontSize(18).text('Boxing Center — documents coach', { align: 'left' });
    doc.moveDown(0.5);
    doc.fillColor('#111').fontSize(11);
    doc.text(`Coach : ${reservation.coach?.first_name || ''} ${reservation.coach?.last_name || ''}`);
    doc.text(`Email : ${reservation.coach?.email || ''}`);
    doc.text(`Réservation : ${reservation.id}`);
    doc.text(`Club : ${reservation.club_id} / ${reservation.space_id || 'salle'}`);
    doc.text(`Créneau : ${reservation.starts_at} → ${reservation.ends_at || ''}`);
    doc.text(`Montant : ${(Number(reservation.amount_cents) / 100).toFixed(2)} €`);
    doc.moveDown();
    doc.text('Documents signés : CGV, règlement intérieur, décharge de responsabilité.');
    doc.moveDown();
    doc.fontSize(9).fillColor('#6B7280');
    doc.text(`Signé le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
    doc.text(`IP : ${ip || '—'}`);
    doc.text(`UA : ${String(userAgent || '').slice(0, 180)}`);
    if (signatureImage && String(signatureImage).startsWith('data:image')) {
      try {
        const b64 = String(signatureImage).split(',')[1];
        const buf = Buffer.from(b64, 'base64');
        doc.moveDown();
        doc.image(buf, { fit: [280, 90] });
      } catch {
        /* pad illisible */
      }
    }
    doc.end();
    out.on('finish', () => {
      const buf = fs.readFileSync(dest);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      resolve({ path: dest, sha256 });
    });
    out.on('error', reject);
  });
}

module.exports = { buildSignaturePdf, SIG_DIR };
