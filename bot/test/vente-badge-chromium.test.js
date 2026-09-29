'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { vendreBadge } = require('../lib/rpa');

const PARCOURS = path.join(__dirname, 'fixtures', 'parcours-vente-badge.html');
const RAPPORT = path.join(__dirname, 'fixtures', 'parcours-vente-badge-resultat.html');

const CAS = [
  {
    titre: 'Minimes, mardi 29 septembre 2026, 10:00-11:00',
    job: {
      action: 'coach_grant',
      order_id: 'resa-ete-10h',
      club_id: 'minimes',
      space_id: 'salle',
      starts_at: '2026-09-29T08:00:00.000Z',
      ends_at: '2026-09-29T09:00:00.000Z',
    },
    debut: '29/09/2026 10:00',
    fin: '29/09/2026 11:00',
    duree: '60',
  },
  {
    titre: 'Portet, jeudi 15 janvier 2026, 18:00-19:00',
    job: {
      action: 'coach_grant',
      order_id: 'resa-hiver-18h',
      club_id: 'portet',
      space_id: 'boxe-fitness',
      starts_at: '2026-01-15T17:00:00.000Z',
      ends_at: '2026-01-15T18:00:00.000Z',
    },
    debut: '15/01/2026 18:00',
    fin: '15/01/2026 19:00',
    duree: '60',
  },
];

function echapper(valeur) {
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ecrireRapport(lignes) {
  const corps = lignes
    .map(
      (l) => `<tr>
        <td>${echapper(l.titre)}</td>
        <td>${echapper(l.debut)}</td>
        <td>${echapper(l.fin)}</td>
        <td>${echapper(l.duree)} min</td>
        <td>${echapper(l.source)}</td>
        <td>${echapper(l.url)}</td>
      </tr>`,
    )
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resultat Chromium — vente badge</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; font-size: 16px; background: #f4f1ec; color: #1a1a1a; }
    main { width: min(100%, 56rem); margin: 0 auto; padding: 1.25rem 1rem 2rem; }
    h1 { font-size: clamp(1.4rem, 4vw, 1.8rem); }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #d9d3c8; vertical-align: top; }
    .table-wrap { overflow-x: auto; }
    a { color: #9a3412; }
  </style>
</head>
<body>
  <main>
    <h1>Vente badge, lue par Chromium</h1>
    <p>Chaque ligne est une vente jouée sur le parcours HTML. Début, fin et durée viennent du reçu affiché après validation, pas d'une valeur écrite à la main.</p>
    <p><a href="./parcours-vente-badge.html">Ouvrir le parcours</a></p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Créneau</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Durée</th>
            <th>Source</th>
            <th>Badge</th>
          </tr>
        </thead>
        <tbody>
          ${corps}
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>
`;
  fs.writeFileSync(RAPPORT, html);
}

test('Chromium vend le badge sur le créneau choisi', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const lignes = [];
  try {
    for (const cas of CAS) {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(PARCOURS).href);
      const url = await vendreBadge(page, cas.job);
      const recu = page.locator('#recu');
      const debut = await recu.getAttribute('data-debut');
      const fin = await recu.getAttribute('data-fin');
      const duree = await recu.getAttribute('data-duree');
      const source = await recu.getAttribute('data-source');

      assert.match(url, /\/badge\/enrol\?c=/);
      assert.equal(source, 'creneau');
      assert.equal(debut, cas.debut);
      assert.equal(fin, cas.fin);
      assert.equal(duree, cas.duree);
      assert.equal(await page.locator('#lien-badge').count(), 1);

      lignes.push({ titre: cas.titre, debut, fin, duree, source, url });
      await page.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }
  ecrireRapport(lignes);
});
