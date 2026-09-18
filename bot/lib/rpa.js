'use strict';

const { logInfo, logWarn } = require('./logger');
const { launchBrowser, saveSession, login, gotoDeciplus, handleChooseZone } = require('./auth');
const { gymLabel, slotNote, identityFromJob, MARKER } = require('./slot-note');

function originOf(page) {
  try {
    return new URL(page.url() || process.env.DECIPLUS_URL || 'https://boxingcenter.deciplus.pro/').origin;
  } catch {
    return 'https://boxingcenter.deciplus.pro';
  }
}

async function gotoLegacy(page, phpPath) {
  const origin = originOf(page);
  const rel = `nextgen/legacy?path=${encodeURIComponent(phpPath)}`;
  await page
    .goto(`${origin}/${rel}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(700);
}

function extractMemberId(hrefOrUrl) {
  const m = String(hrefOrUrl || '').match(/idj(?:=|%3D)(\d+)/i);
  return m ? m[1] : null;
}

async function writeInfoCompta(page, line) {
  const ta = page
    .locator('textarea[name="info_compta"], input[name="info_compta"], textarea#info_compta')
    .first();
  if ((await ta.count()) === 0) {
    logWarn('Coach-slot — champ info_compta introuvable');
    return false;
  }
  const current = String((await ta.inputValue().catch(() => '')) || '');
  const next = current.includes(line) ? current : `${line}\n${current}`.slice(0, 1900);
  await ta.fill(next);
  const update = page
    .locator(
      'input[type="submit"][value*="Mettre"], button:has-text("Mettre à jour"), input[name="update"], input[type="submit"][value*="Valider"]',
    )
    .first();
  if ((await update.count()) > 0) {
    await update.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  return true;
}

async function openMember(page, memberId) {
  await gotoLegacy(page, `/joueurs.php?idj=${memberId}`);
  const ta = page.locator('textarea[name="info_compta"], input[name="nom"]:not(#i_nom)').first();
  return (await ta.count()) > 0;
}

async function searchMember(page, identity) {
  await gotoLegacy(page, '/select.php');
  const email = String(identity.email || '').trim();
  const phone = String(identity.phone || '').trim();
  const last = String(identity.last_name || '').trim();
  const first = String(identity.first_name || '').trim();

  const fill = async (sel, value) => {
    if (!value) return;
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) await el.fill(value);
  };

  if (email) await fill('#i_email, input[name="i_email"]', email);
  else if (phone) await fill('#i_tel, input[name="i_tel"]', phone);
  else {
    await fill('#i_nom, input[name="i_nom"]', last);
    await fill('#i_prenom, input[name="i_prenom"]', first);
  }

  const submit = page
    .locator('input[type="submit"], button:has-text("Rechercher"), button[type="submit"]')
    .first();
  if ((await submit.count()) > 0) await submit.click().catch(() => {});
  await page.waitForTimeout(900);

  const link = page.locator('table a[href*="idj="], #liste a[href*="idj="]').first();
  if ((await link.count()) === 0) return null;
  const href = (await link.getAttribute('href').catch(() => '')) || page.url();
  const id = extractMemberId(href);
  if (!id || id === 'new') return null;
  return id;
}

async function createMember(page, identity) {
  await gotoLegacy(page, '/joueurs.php?idj=new');
  const fill = async (sel, value) => {
    if (!value) return false;
    const el = page.locator(sel).first();
    if ((await el.count()) === 0) return false;
    await el.fill(String(value));
    return true;
  };
  await fill('input[name="nom"]:not(#i_nom)', identity.last_name || 'Coach');
  await fill('input[name="prenom"]:not(#i_prenom)', identity.first_name || 'Slot');
  await fill('input[name="email"]:not(#i_email)', identity.email || '');
  await fill('input[name="tel"]:not(#i_tel), input[name="portable"]', identity.phone || '');
  if (identity.birth_date) {
    const d = String(identity.birth_date);
    const fr = /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
      : d;
    await fill('input[name="datenaissance"], input[name="naissance"]', fr);
  }
  const create = page
    .locator(
      'input[type="submit"][value*="Créer"], button:has-text("Créer"), input[name="create"], input[type="submit"][value*="Ajouter"]',
    )
    .first();
  if ((await create.count()) > 0) {
    await create.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  return extractMemberId(page.url());
}

async function resolveMember(page, job) {
  if (job.deciplus_member_id) {
    const ok = await openMember(page, String(job.deciplus_member_id));
    if (ok) return String(job.deciplus_member_id);
  }
  const identity = identityFromJob(job);
  const found = await searchMember(page, identity);
  if (found) {
    await openMember(page, found);
    return found;
  }
  const created = await createMember(page, identity);
  if (!created) throw new Error('Membre Deciplus introuvable / non créé');
  await openMember(page, created);
  return created;
}

async function runAccessJob(job) {
  const action = String(job.action || '').toLowerCase();
  const grant = action === 'coach_grant' || action === 'grant';
  const { browser, context, page } = await launchBrowser();
  try {
    const site = gymLabel(job.club_id || job.gym);
    await login(page, { siteLabel: site });
    await handleChooseZone(page, site);
    await gotoDeciplus(page, 'select.php').catch(() => {});

    let memberId = job.deciplus_member_id || null;
    if (grant || !memberId) {
      memberId = await resolveMember(page, job);
    } else {
      const ok = await openMember(page, String(memberId));
      if (!ok) memberId = await resolveMember(page, { ...job, deciplus_member_id: null });
    }

    const verb = grant ? 'GRANT' : 'REVOKE';
    await writeInfoCompta(page, slotNote(job, verb));
    logInfo(`Coach-slot ${verb}`, {
      order_id: job.order_id || job.reservation_id,
      member_id: memberId,
      marker: MARKER,
      site,
    });
    await saveSession(context);
    return {
      status: grant ? 'granted' : 'revoked',
      deciplus_member_id: memberId,
      action: grant ? 'coach_grant' : 'coach_revoke',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { runAccessJob, writeInfoCompta, searchMember, MARKER };
