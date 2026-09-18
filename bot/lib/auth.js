'use strict';

const fs = require('fs');
const path = require('path');
const { logInfo, logWarn } = require('./logger');
const { launchChromiumWithRetry } = require('./playwright-launch');
const { gymLabel } = require('./slot-note');

const SESSION_DIR = process.env.BOT_SESSION_DIR || path.join(__dirname, '..', 'data', 'session');
const STORAGE_FILE = path.join(SESSION_DIR, 'storage-state.json');
const AUTH_COOLDOWN_MS = Number(process.env.BOT_AUTH_COOLDOWN_MS || 10 * 60 * 1000);

let loginInFlight = null;
let authBlockedUntil = 0;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isAuthBlocked() {
  return Date.now() < authBlockedUntil;
}

function blockAuthRetries(reason) {
  authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
  logWarn('Connexion Deciplus en cooldown', { reason });
}

function assertAuthAllowed() {
  if (isAuthBlocked()) {
    const minutes = Math.ceil((authBlockedUntil - Date.now()) / 60000);
    throw new Error(`Connexion Deciplus en cooldown (${minutes} min)`);
  }
}

async function getAccessToken(page) {
  try {
    return await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('auth') || '{}').token || null;
      } catch {
        return null;
      }
    });
  } catch {
    return null;
  }
}

async function isAccessTokenValid(page, token) {
  if (!token) return false;
  try {
    const base = process.env.DECIPLUS_URL || 'https://boxingcenter.deciplus.pro/';
    const res = await page.context().request.get(
      'https://api.deciplus.pro/staff/v1/product/getAvailableProducts?all=true',
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'x-access-token': token,
          'Deciplus-Client-Type': 'manager',
          Referer: new URL('nextgen/home', base).href,
        },
        timeout: 20000,
      },
    );
    return res.ok();
  } catch {
    return false;
  }
}

async function fillVisible(page, selectors, value) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    try {
      if ((await el.count()) > 0 && (await el.isVisible()) && (await el.isEnabled())) {
        await el.fill(value, { timeout: 15000 });
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

async function isVerificationScreen(page) {
  const url = page.url();
  if (/verif|validation|otp|2fa|mfa|authenticate/i.test(url)) return true;
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/V[ée]rifions votre identit|code envoy[ée].*adresse|renseigner.*code/i.test(bodyText)) {
    return true;
  }
  const visible = page.locator('#userValidationCode').first();
  return (await visible.count()) > 0 && (await visible.isVisible().catch(() => false));
}

async function handleEmailVerification(page, opts = {}) {
  const manual = String(process.env.DECIPLUS_EMAIL_CODE || process.env.DECIPLUS_OTP || '').trim();
  let code = manual;
  let source = 'env';
  if (!code) {
    const { isImapOtpConfigured, fetchDeciplusEmailCode } = require('./imap-otp');
    if (!isImapOtpConfigured()) {
      throw new Error('Deciplus demande un code e-mail — DECIPLUS_IMAP_PASS manquant');
    }
    code = await fetchDeciplusEmailCode({
      notBeforeMs: opts.notBeforeMs || Date.now() - 60_000,
    });
    source = 'imap';
  }
  if (!code) {
    throw new Error('Code e-mail Deciplus introuvable dans IMAP');
  }
  logInfo('Saisie code vérification Deciplus', { source });

  const visibleCode = page.locator('#userValidationCode').first();
  if ((await visibleCode.count()) > 0) {
    await visibleCode.click({ timeout: 5000 }).catch(() => {});
    await visibleCode.fill('');
    await visibleCode.fill(code);
  } else {
    await fillVisible(page, [
      'input[name="code"]',
      'input[name="otp"]',
      'input[autocomplete="one-time-code"]',
    ], code);
  }
  const hidden = page.locator('input[name="validationCode"], #validationCode').first();
  if ((await hidden.count()) > 0) {
    await hidden.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, code);
  }
  const validateBtn = page
    .locator('.swal2-confirm, button:has-text("Valider"), input[value="Valider"]')
    .first();
  if ((await validateBtn.count()) > 0) {
    await validateBtn.click({ noWaitAfter: true, timeout: 15000 }).catch(() => {});
  }
  await Promise.race([
    page.waitForURL(/choose-zone|nextgen|home|select\.php/i, { timeout: 45000 }),
    page.waitForFunction(() => {
      try {
        return Boolean(JSON.parse(localStorage.getItem('auth') || '{}').token);
      } catch {
        return false;
      }
    }, { timeout: 45000 }),
  ]).catch(() => {});
  await page.waitForTimeout(1200);
}

async function gotoDeciplus(page, pathPart = '') {
  const base = process.env.DECIPLUS_URL || 'https://boxingcenter.deciplus.pro/';
  const timeout = Number(process.env.DECIPLUS_NAV_TIMEOUT || 90000);
  const target = pathPart ? new URL(pathPart, base).href : base;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout }).catch(async () => {
    await page.goto(target, { waitUntil: 'commit', timeout: Math.min(timeout, 45000) });
  });
  await page.waitForTimeout(Number(process.env.DECIPLUS_NAV_SETTLE_MS || 500));
}

async function handleChooseZone(page, siteLabel) {
  const label = String(siteLabel || gymLabel() || 'Minimes').trim();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const onPicker =
      /choose-zone/i.test(page.url()) ||
      ((await page.locator('text=/Choisissez un site/i').count()) > 0 &&
        (await page.locator('text=/Choisissez un site/i').first().isVisible().catch(() => false)));
    if (!onPicker) return true;
    const opt = page.getByText(label, { exact: false }).first();
    if ((await opt.count()) > 0) {
      await opt.click({ timeout: 8000 }).catch(() => {});
      const sell = page
        .locator('button:has-text("Vendre"), button:has-text("Continuer"), button:has-text("Valider")')
        .first();
      if ((await sell.count()) > 0) await sell.click().catch(() => {});
      await page.waitForTimeout(800);
      return true;
    }
    await page.waitForTimeout(400);
  }
  logWarn('Picker site Deciplus non tranché', { site: label, url: page.url() });
  return false;
}

async function submitLoginForm(page, user, pass) {
  const userOk = await fillVisible(page, [
    'input[name="pseudo"]',
    '#pseudo',
    'input[name="username"]',
    'input[name="login"]',
    'input[type="text"]',
  ], user);
  const passOk = await fillVisible(page, [
    'input[name="passwd"]',
    '#passwd',
    'input[name="password"]',
    'input[type="password"]',
  ], pass);
  if (!userOk || !passOk) {
    throw new Error('Formulaire de connexion Deciplus introuvable');
  }
  const submit = page
    .locator('button[name="submitLogin"], button.login__submit, button:has-text("Connexion"), button[type="submit"]')
    .first();
  if ((await submit.count()) > 0) {
    await submit.click({ noWaitAfter: true, timeout: 15000 }).catch(() => {});
  }
  await Promise.race([
    page.waitForURL(/choose-zone|nextgen|verif|otp|code|home|select\.php/i, { timeout: 45000 }),
    page.waitForLoadState('domcontentloaded', { timeout: 45000 }),
  ]).catch(() => {});
}

async function isLoggedIn(page) {
  if (await isVerificationScreen(page)) return false;
  const token = await getAccessToken(page);
  if (!token) return false;
  return isAccessTokenValid(page, token);
}

async function performLogin(page, options = {}) {
  const url = process.env.DECIPLUS_URL;
  const user = process.env.DECIPLUS_USER;
  const pass = process.env.DECIPLUS_PASSWORD;
  const siteLabel = options.siteLabel || process.env.DECIPLUS_DEFAULT_SITE || 'Minimes';
  if (!url || !user || !pass) {
    throw new Error('DECIPLUS_URL, DECIPLUS_USER et DECIPLUS_PASSWORD requis');
  }

  await gotoDeciplus(page, '');
  if (await isVerificationScreen(page)) {
    await handleEmailVerification(page, { notBeforeMs: Date.now() - 120_000 });
  }
  if ((await isLoggedIn(page)) && !options.force) {
    logInfo('Déjà connecté Deciplus (session persistée)');
    await handleChooseZone(page, siteLabel);
    return;
  }

  logInfo('Session inactive — login Deciplus JUNIOR');
  const loginStartedAt = Date.now();
  await submitLoginForm(page, user, pass);

  let sawOtp = false;
  for (let i = 0; i < 12; i += 1) {
    if (await isVerificationScreen(page)) {
      sawOtp = true;
      break;
    }
    if (await getAccessToken(page)) break;
    await page.waitForTimeout(500);
  }
  if (sawOtp) {
    await handleEmailVerification(page, { notBeforeMs: loginStartedAt - 5_000 });
  }
  if (!(await isLoggedIn(page))) {
    throw new Error(
      sawOtp
        ? 'Code e-mail Deciplus non validé — IMAP jeremyfidge'
        : 'Échec connexion Deciplus — identifiants JUNIOR',
    );
  }
  logInfo('Connexion Deciplus réussie');
  await handleChooseZone(page, siteLabel);
}

async function login(page, options = {}) {
  assertAuthAllowed();
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    try {
      await performLogin(page, options);
    } catch (err) {
      if (/code|IMAP|otp|mfa|cooldown|e-mail/i.test(err.message)) {
        blockAuthRetries(err.message);
      }
      throw err;
    }
  })().finally(() => {
    loginInFlight = null;
  });
  return loginInFlight;
}

async function launchBrowser() {
  ensureDir(SESSION_DIR);
  const browser = await launchChromiumWithRetry();
  const contextOptions = { viewport: { width: 1280, height: 720 }, locale: 'fr-FR' };
  if (fs.existsSync(STORAGE_FILE)) contextOptions.storageState = STORAGE_FILE;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { browser, context, page };
}

async function saveSession(context) {
  ensureDir(SESSION_DIR);
  const state = await context.storageState();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  SESSION_DIR,
  STORAGE_FILE,
  launchBrowser,
  saveSession,
  login,
  gotoDeciplus,
  getAccessToken,
  isLoggedIn,
  handleChooseZone,
};
