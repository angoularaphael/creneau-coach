import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  comparaisonConstante,
  comparaisonHexConstante,
  empreinte,
  hachePoivre,
  hashCorpsBrut,
  hmacHex,
  sha256Hex,
  // n'est pas activé dans tsconfig.json, qui n'appartient pas à ce lot. Ce
  // `@ts-expect-error` supprime exactement TS5097 et rien d'autre : les types de
  // `crypto.ts` continuent d'être vérifiés à travers lui. Même convention que
  // `src/domain/*.test.ts`.
} from '../crypto.ts'

/**
 * Tests de la couche crypto — spec-04 §1, §4.4, §5.5, §10.2.
 *
 * `crypto.ts` porte `import 'server-only'`, dont le paquet lève hors condition
 * `react-server`. Ce fichier se lance donc ainsi :
 *
 *     node --test --experimental-strip-types --conditions=react-server \
 *          src/lib/security/__tests__/crypto.test.ts
 *
 * (script `npm run test:securite`). Sans `--conditions=react-server`,
 * `server-only` résout vers `index.js`, qui lève : c'est exactement la barrière
 * qu'on veut en production, il faut juste la satisfaire en test.
 */

describe('comparaison en temps constant', () => {
  it('reconnaît deux chaînes identiques', () => {
    assert.equal(comparaisonConstante('secret-partage', 'secret-partage'), true)
  })

  it('refuse deux chaînes différentes de même longueur', () => {
    assert.equal(comparaisonConstante('secret-partage', 'secret-partagX'), false)
  })

  it('refuse deux chaînes de longueurs différentes sans lever', () => {
    // C'est le cas qui fait planter un `timingSafeEqual` nu : il exige deux
    // buffers de même taille. On égalise par le hash, donc il ne lève jamais.
    assert.equal(comparaisonConstante('court', 'beaucoup-plus-long-que-court'), false)
  })

  it("refuse la chaîne vide des deux côtés — sha256('') === sha256('')", () => {
    // Sans ce garde-fou, un serveur dont SYNC_SECRET est vide accepterait un
    // appelant qui envoie un en-tête vide. C'est le `Boolean(SYNC) &&` de
    // server.js, rendu explicite.
    assert.equal(comparaisonConstante('', ''), false)
    assert.equal(comparaisonConstante('', 'secret'), false)
    assert.equal(comparaisonConstante('secret', ''), false)
  })

  it('est insensible à la position du premier octet différent', () => {
    // On ne mesure pas le temps ici — un test de temps est instable en CI. On
    // vérifie la CORRECTION sur les deux extrêmes : différence au premier octet
    // et différence au dernier. Une comparaison `===` donnerait les mêmes
    // booléens ; ce test verrouille le comportement, la propriété de temps
    // constant est apportée par `timingSafeEqual` sur deux buffers de 32 octets.
    const reference = 'a'.repeat(64)
    assert.equal(comparaisonConstante(reference, `b${'a'.repeat(63)}`), false)
    assert.equal(comparaisonConstante(reference, `${'a'.repeat(63)}b`), false)
  })

  it('accepte une signature HMAC recalculée à l’identique', () => {
    const secret = 'secret-de-transport'
    const canonique = 'v1:bot-deciplus:POST:/api/v1/internal/sync:1758153600000:nonce-1:abc'
    assert.equal(comparaisonConstante(hmacHex(secret, canonique), hmacHex(secret, canonique)), true)
  })

  it('refuse une signature calculée avec un autre secret', () => {
    const canonique = 'v1:bot:POST:/x:1:n:h'
    assert.equal(comparaisonConstante(hmacHex('bon', canonique), hmacHex('mauvais', canonique)), false)
  })
})

describe('comparaison hexadécimale stricte', () => {
  it('accepte deux hex identiques', () => {
    const h = sha256Hex('charge')
    assert.equal(comparaisonHexConstante(h, h), true)
  })

  it('refuse ce qui n’est pas de l’hexadécimal', () => {
    // `Buffer.from('zz…', 'hex')` rend un buffer VIDE sans lever, et deux
    // buffers vides sont « égaux ». Sans le contrôle de forme, n'importe quelle
    // chaîne non-hex de la bonne longueur passerait. C'est le piège exact.
    const nonHex = 'z'.repeat(64)
    assert.equal(comparaisonHexConstante(nonHex, nonHex), false)
    assert.equal(comparaisonHexConstante(sha256Hex('x'), nonHex), false)
  })

  it('refuse une longueur impaire et la chaîne vide', () => {
    assert.equal(comparaisonHexConstante('abc', 'abc'), false)
    assert.equal(comparaisonHexConstante('', ''), false)
  })

  it('refuse deux longueurs différentes', () => {
    assert.equal(comparaisonHexConstante('abcd', 'abcdef'), false)
  })
})

describe('hash du corps BRUT — spec-04 §4.4', () => {
  it('distingue deux corps qui ne diffèrent que par les espaces', () => {
    // LE bug d'AMAZ. `internal-signature.js` hache `JSON.stringify(body)` sur un
    // corps déjà parsé par Express. Les deux corps ci-dessous sont différents sur
    // le fil et doivent donner deux hashes différents.
    const avecEspaces = '{"club_id":"minimes", "space_id":"salle"}'
    const sansEspaces = '{"club_id":"minimes","space_id":"salle"}'

    assert.notEqual(hashCorpsBrut(avecEspaces), hashCorpsBrut(sansEspaces))
  })

  it('montre que la re-sérialisation écrase la différence — ce qu’on refuse', () => {
    const avecEspaces = '{"club_id":"minimes", "space_id":"salle"}'
    const sansEspaces = '{"club_id":"minimes","space_id":"salle"}'

    const reserialise = (x: string) => sha256Hex(JSON.stringify(JSON.parse(x)))

    // La méthode fautive rend le MÊME hash pour deux corps différents…
    assert.equal(reserialise(avecEspaces), reserialise(sansEspaces))
    // …alors que la nôtre les distingue. C'est toute la différence entre
    // « deux requêtes identiques » et « deux requêtes qu'on croit identiques ».
    assert.notEqual(hashCorpsBrut(avecEspaces), hashCorpsBrut(sansEspaces))
  })

  it('distingue deux notations du même nombre', () => {
    // '{"n":1e2}' et '{"n":100}' sont sémantiquement identiques pour JSON.parse,
    // mais ce sont deux octets-suites différentes. Une signature HMAC porte sur
    // les octets, donc le hash doit les distinguer.
    const notationExposant = '{"n":1e2}'
    const notationDecimale = '{"n":100}'

    assert.notEqual(hashCorpsBrut(notationExposant), hashCorpsBrut(notationDecimale))
    assert.equal(
      sha256Hex(JSON.stringify(JSON.parse(notationExposant))),
      sha256Hex(JSON.stringify(JSON.parse(notationDecimale))),
    )
  })

  it('est stable et vaut bien le sha256 du texte reçu', () => {
    const corps = '{"provider":"payplug"}'
    assert.equal(hashCorpsBrut(corps), createHash('sha256').update(corps).digest('hex'))
    assert.equal(hashCorpsBrut(corps), hashCorpsBrut(corps))
    assert.equal(hashCorpsBrut(corps).length, 64)
  })

  it('accepte un corps vide sans lever', () => {
    // POST /reservations/{id}/cancel n'a pas de corps au contrat.
    assert.equal(hashCorpsBrut('').length, 64)
  })
})

describe('empreintes et pseudonymisation — spec-04 §10.2', () => {
  it('ne rend jamais la valeur d’origine', () => {
    const cle = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const fp = empreinte(cle)
    assert.equal(fp.length, 16)
    assert.ok(!fp.includes(cle))
    assert.notEqual(fp, cle)
  })

  it('est déterministe, donc corrélable entre deux lignes de journal', () => {
    assert.equal(empreinte('meme-cle'), empreinte('meme-cle'))
    assert.notEqual(empreinte('cle-a'), empreinte('cle-b'))
  })

  it('le poivre change le hash — sans lui, sha256(ip) est brutalisable', () => {
    const ip = '81.250.12.34'
    assert.notEqual(hachePoivre('poivre-1', ip), hachePoivre('poivre-2', ip))
    assert.equal(hachePoivre('poivre-1', ip), hachePoivre('poivre-1', ip))
    assert.equal(hachePoivre('poivre-1', ip).length, 32)
  })

  it('deux IP différentes ne collisionnent pas sous le même poivre', () => {
    assert.notEqual(hachePoivre('p', '81.250.12.34'), hachePoivre('p', '81.250.12.35'))
  })
})
