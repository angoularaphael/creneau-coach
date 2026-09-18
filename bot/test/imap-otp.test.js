'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractOtpCode } = require('../lib/imap-otp');

test('extrait un code unique 3+3', () => {
  assert.equal(extractOtpCode('Voici votre code unique : 807 803'), '807803');
});

test('extrait 6 chiffres collés', () => {
  assert.equal(extractOtpCode('Code de vérification 421990'), '421990');
});

test('ignore une année 20xx isolée', () => {
  assert.equal(extractOtpCode('Message du 2024 — code 654321'), '654321');
});
