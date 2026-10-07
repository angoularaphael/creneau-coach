import { test } from 'node:test'
import assert from 'node:assert/strict'

import { venteAuBonClub } from './vente-club.ts'

test('la vente n est retenue que si le club Deciplus est celui de la reservation', () => {
  assert.equal(venteAuBonClub('minimes', 'minimes'), true)
  assert.equal(venteAuBonClub('portet', 'portet'), true)
  assert.equal(venteAuBonClub('st-cyprien', 'st-cyprien'), true)
})

test('un autre club, un slug vide ou un repli Minimes est refuse', () => {
  assert.equal(venteAuBonClub('portet', 'minimes'), false)
  assert.equal(venteAuBonClub('ramonville', ''), false)
  assert.equal(venteAuBonClub('', 'minimes'), false)
  assert.equal(venteAuBonClub('etats-unis', 'minimes'), false)
})
