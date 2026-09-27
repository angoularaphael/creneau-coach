import { test } from 'node:test'
import assert from 'node:assert/strict'

import { actionBotPourReservation, decisionAffichageQr } from './qr-fenetre.ts'

const FROM = '2026-09-18T08:00:00.000Z'
const TO = '2026-09-18T09:00:00.000Z'
const URL = 'https://boxingcenter.deciplus.pro/badge/enrol?c=6C419F5B'

test('QR refuse hors fenêtre, même si une URL existe', () => {
  const avant = new Date('2026-09-18T07:59:00.000Z').getTime()
  const apres = new Date('2026-09-18T09:00:00.000Z').getTime()
  assert.equal(decisionAffichageQr(avant, FROM, TO, URL), 'refus')
  assert.equal(decisionAffichageQr(apres, FROM, TO, URL), 'refus')
})

test('QR en préparation dans la fenêtre sans URL, image seulement avec URL', () => {
  const pendant = new Date('2026-09-18T08:10:00.000Z').getTime()
  assert.equal(decisionAffichageQr(pendant, FROM, TO, null), 'preparation')
  assert.equal(decisionAffichageQr(pendant, FROM, TO, ''), 'preparation')
  assert.equal(decisionAffichageQr(pendant, FROM, TO, URL), 'afficher')
})

test('le cron vend pendant le créneau et révoque à la fin', () => {
  const base = {
    status: 'confirmed',
    deciplus_job_status: 'none',
    qr_valid_from: FROM,
    qr_valid_to: TO,
  }
  const avant = new Date('2026-09-18T07:00:00.000Z').getTime()
  const pendant = new Date('2026-09-18T08:10:00.000Z').getTime()
  const fin = new Date(TO).getTime()
  assert.equal(actionBotPourReservation(avant, base), 'rien')
  assert.equal(actionBotPourReservation(pendant, base), 'grant')
  assert.equal(actionBotPourReservation(pendant, { ...base, deciplus_job_status: 'granted' }), 'rien')
  assert.equal(actionBotPourReservation(fin, { ...base, deciplus_job_status: 'granted' }), 'revoke')
  assert.equal(actionBotPourReservation(fin, { ...base, deciplus_job_status: 'revoked' }), 'rien')
})
