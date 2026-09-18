#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { imapConfig, isImapOtpConfigured, imapMissingReason, testImapConnection } = require('../lib/imap-otp');

async function main() {
  const cfg = imapConfig();
  console.log('=== Test IMAP Deciplus (créneaux coachs) ===');
  console.log(`Boîte : ${cfg.user || '(DECIPLUS_IMAP_USER vide)'}`);
  console.log(`Serveur : ${cfg.host}:${cfg.port}`);
  if (!isImapOtpConfigured()) {
    console.error('\nPAS ENCORE FAIT :');
    console.error(`  ${imapMissingReason()}`);
    console.error('\nÉtapes Gmail (compte jeremyfidge@gmail.com) :');
    console.error('  1. Gmail → Paramètres → Transfert et POP/IMAP → Activer IMAP');
    console.error('  2. Compte Google → Sécurité → Validation en 2 étapes (obligatoire)');
    console.error('  3. https://myaccount.google.com/apppasswords → Mail / Autre « creneau-bot »');
    console.error('  4. Coller les 16 caractères dans bot/.env → DECIPLUS_IMAP_PASS=xxxx xxxx xxxx xxxx');
    console.error('  5. Relancer : npm run test:imap');
    process.exit(2);
  }
  try {
    const result = await testImapConnection();
    console.log('\nIMAP OK');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nLes codes 2FA Deciplus de JUNIOR doivent arriver sur cette boîte.');
    process.exit(0);
  } catch (err) {
    console.error('\nIMAP ÉCHEC :', err.message);
    if (/AUTHENTICATIONFAILED|Invalid credentials|ALERT/i.test(err.message)) {
      console.error('→ Mot de passe d’application faux, ou 2FA Gmail pas activée, ou IMAP pas activé.');
    }
    process.exit(1);
  }
}

main();
