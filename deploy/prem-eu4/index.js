#!/usr/bin/env node
/**
 * Bot créneau coachs — prem-eu4.bot-hosting.net:20695
 *
 * Clone creneau-coach, lance bot/start.js (JUNIOR + IMAP jeremyfidge@gmail.com).
 *
 * Upload panel :
 *   /home/container/index.js  (ce fichier)
 *   /home/container/.env      (voir .env.example)
 *
 * Startup : node index.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const BOT_DIR = path.join(ROOT, 'creneau-coach');
const REPO = process.env.BOT_REPO_URL || 'https://github.com/angoularaphael/creneau-coach.git';
const BRANCH = process.env.BOT_REPO_BRANCH || 'main';

function log(msg) {
  console.log(`[creneau-coach eu4] ${msg}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    log(`ATTENTION: .env manquant (${filePath})`);
    return;
  }
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
  }
}

function run(cmd, cwd = ROOT) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd, shell: true, env: process.env });
}

function resolvePath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function ensureDataPaths() {
  const dataRoot = resolvePath(process.env.BOT_DATA_DIR || 'data');
  const tmp = resolvePath(process.env.TMPDIR || path.join(dataRoot, 'tmp'));
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'session'), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'queue'), { recursive: true });
  process.env.TMPDIR = tmp;
  process.env.BOT_DATA_DIR = dataRoot;
  process.env.BOT_QUEUE_DIR = process.env.BOT_QUEUE_DIR || path.join(dataRoot, 'queue');
  process.env.BOT_SESSION_DIR = resolvePath(process.env.BOT_SESSION_DIR || path.join(dataRoot, 'session'));
  log(`Queue → ${process.env.BOT_QUEUE_DIR}`);
  log(`Session → ${process.env.BOT_SESSION_DIR}`);
}

loadEnvFile(ENV_FILE);

process.env.BOT_ROLE = process.env.BOT_ROLE || 'coach-access';
process.env.BOT_ID = process.env.BOT_ID || 'junior-coach';
process.env.BOT_HTTP_PORT = process.env.BOT_HTTP_PORT || process.env.PORT || '20695';
process.env.DECIPLUS_USER = process.env.DECIPLUS_USER || 'JUNIOR';
process.env.DECIPLUS_IMAP_USER = process.env.DECIPLUS_IMAP_USER || 'jeremyfidge@gmail.com';
process.env.ALERT_EMAIL = process.env.ALERT_EMAIL || 'boxingcentertls@gmail.com';

ensureDataPaths();
log(`.env ${fs.existsSync(ENV_FILE) ? 'OK' : 'MANQUANT'} (${ENV_FILE})`);
log(`BOT_ROLE=${process.env.BOT_ROLE} BOT_ID=${process.env.BOT_ID} PORT=${process.env.BOT_HTTP_PORT}`);
log(`IMAP ${process.env.DECIPLUS_IMAP_USER} pass=${process.env.DECIPLUS_IMAP_PASS ? 'oui' : 'NON — à faire'}`);

function ensureBotRepo() {
  if (!fs.existsSync(path.join(BOT_DIR, 'bot', 'start.js'))) {
    log(`Clone ${REPO} → ${BOT_DIR}`);
    run(`git clone --depth 1 --branch ${BRANCH} ${REPO} "${BOT_DIR}"`);
    return;
  }
  log('Mise a jour repo…');
  try {
    run(`git fetch origin && git reset --hard origin/${BRANCH}`, BOT_DIR);
  } catch {
    log('git pull ignore');
  }
}

const appDir = path.join(BOT_DIR, 'bot');
ensureBotRepo();

const panelEnv = path.join(ROOT, '.env');
const botEnv = path.join(appDir, '.env');
if (fs.existsSync(panelEnv)) {
  fs.copyFileSync(panelEnv, botEnv);
  log(`Copie .env panel → ${botEnv}`);
}

run('npm install --omit=dev --no-fund --no-audit --ignore-scripts', appDir);

log('Demarrage bot créneau coachs (JUNIOR / jeremyfidge)…');
run('node start.js', appDir);
