'use strict';

const { chromium } = require('playwright');
const { logWarn } = require('./logger');

function isHostedBot() {
  if (process.platform !== 'linux') return false;
  return Boolean(
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
      process.env.BOXPLUS_HOSTED === '1' ||
      process.cwd().startsWith('/home/container'),
  );
}

function getChromiumLaunchOptions() {
  const hosted = isHostedBot();
  const headless =
    String(process.env.DECIPLUS_HEADLESS ?? (hosted ? 'true' : 'false')).toLowerCase() !== 'false';
  const args = hosted
    ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-first-run',
        '--disable-extensions',
        '--mute-audio',
      ]
    : [];

  return {
    headless,
    args,
    timeout: Number(process.env.PLAYWRIGHT_LAUNCH_TIMEOUT || 120000),
  };
}

async function launchChromiumWithRetry(maxAttempts = 3) {
  const opts = getChromiumLaunchOptions();
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const browser = await chromium.launch(opts);
      if (!browser.isConnected()) throw new Error('Navigateur déconnecté après launch');
      return browser;
    } catch (err) {
      lastError = err;
      logWarn(`Playwright launch ${attempt}/${maxAttempts} échoué`, { error: err.message });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
  }
  throw lastError || new Error('Impossible de lancer Chromium');
}

module.exports = { getChromiumLaunchOptions, launchChromiumWithRetry, isHostedBot };
