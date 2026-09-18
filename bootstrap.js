#!/usr/bin/env node
'use strict';

/**
 * BotHosting — déposer ce fichier comme /home/container/index.js
 * (ou démarrer avec : node bootstrap.js)
 *
 * 1) charge .env racine
 * 2) git clone/pull creneau-coach (si le repo n’est pas déjà là)
 * 3) npm install dans bot/
 * 4) lance bot/start.js (JUNIOR + IMAP jeremyfidge@gmail.com)
 *
 * Health : http://prem-eu4.bot-hosting.net:20695/health
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ROOT_ENV = path.join(ROOT, '.env');
const REPO =
  process.env.BOT_REPO_URL ||
  process.env.BOT_GITHUB_REPO ||
  'https://github.com/angoularaphael/creneau-coach.git';
const BRANCH = process.env.BOT_REPO_BRANCH || 'main';
const APP_NAME = process.env.BOT_APP_DIR || 'creneau-coach-app';

function log(msg, meta) {
  console.log(`[creneau-coach bootstrap] ${msg}`, meta ? JSON.stringify(meta) : '');
}

function loadRootEnv() {
  if (!fs.existsSync(ROOT_ENV)) {
    log('ATTENTION: .env manquant à côté de bootstrap.js');
    return;
  }
  for (const line of fs.readFileSync(ROOT_ENV, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val;
  }
}

function run(cmd, cwd = ROOT) {
  log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env, shell: true });
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
  process.env.BOT_SESSION_DIR = resolvePath(
    process.env.BOT_SESSION_DIR || path.join(dataRoot, 'session')
  );
}

function looksLikeBotDir(dir) {
  return fs.existsSync(path.join(dir, 'start.js')) && fs.existsSync(path.join(dir, 'package.json'));
}

function resolveBotDir() {
  if (looksLikeBotDir(ROOT)) {
    return { botDir: ROOT, cloneRoot: null };
  }
  if (looksLikeBotDir(path.join(ROOT, 'bot'))) {
    return { botDir: path.join(ROOT, 'bot'), cloneRoot: ROOT };
  }
  const cloneRoot = path.join(ROOT, APP_NAME);
  return { botDir: path.join(cloneRoot, 'bot'), cloneRoot };
}

loadRootEnv();

process.env.BOT_ROLE = process.env.BOT_ROLE || 'coach-access';
process.env.BOT_ID = process.env.BOT_ID || 'junior-coach';
process.env.DECIPLUS_USER = process.env.DECIPLUS_USER || 'JUNIOR';
process.env.DECIPLUS_IMAP_USER = process.env.DECIPLUS_IMAP_USER || 'jeremyfidge@gmail.com';
process.env.ALERT_EMAIL = process.env.ALERT_EMAIL || 'boxingcentertls@gmail.com';
process.env.BOT_HTTP_PORT =
  process.env.BOT_HTTP_PORT || process.env.SERVER_PORT || process.env.PORT || '20695';
process.env.PORT = process.env.BOT_HTTP_PORT;

ensureDataPaths();

const { botDir, cloneRoot } = resolveBotDir();
const inPlace = looksLikeBotDir(ROOT) || looksLikeBotDir(path.join(ROOT, 'bot'));

log('Démarrage', {
  repo: REPO,
  branch: BRANCH,
  bot: botDir,
  port: process.env.BOT_HTTP_PORT,
  imap: process.env.DECIPLUS_IMAP_USER,
  imap_pass: process.env.DECIPLUS_IMAP_PASS ? 'oui' : 'NON — à faire',
});

if (!inPlace) {
  if (!fs.existsSync(path.join(cloneRoot, '.git'))) {
    log(`Clone ${REPO}`);
    run(`git clone --depth 1 --branch ${BRANCH} ${REPO} "${cloneRoot}"`);
  } else {
    log('Mise à jour repo…');
    try {
      run(`git fetch origin && git reset --hard origin/${BRANCH}`, cloneRoot);
    } catch (err) {
      log(`git update ignoré: ${err.message}`);
    }
  }
}

if (!looksLikeBotDir(botDir)) {
  console.error(`[creneau-coach bootstrap] bot/start.js introuvable dans ${botDir}`);
  process.exit(1);
}

if (fs.existsSync(ROOT_ENV)) {
  fs.copyFileSync(ROOT_ENV, path.join(botDir, '.env'));
  log('.env copié vers bot/');
}

run('npm install --omit=dev --no-fund --no-audit --ignore-scripts', botDir);
run('npm install imapflow mailparser --omit=dev --no-fund --no-audit', botDir);

log('Lancement bot/start.js…');
process.chdir(botDir);
require(path.join(botDir, 'start.js'));
