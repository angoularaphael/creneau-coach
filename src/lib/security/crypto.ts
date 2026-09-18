import 'server-only'

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

/**
 * Primitives cryptographiques — spec-04 §1 (ligne `shared/utils/crypto.js` : « GARDE tel quel »).
 *
 * Le seul fichier d'AMAZ que la spec garde sans correction. On le reprend donc à
 * l'identique dans l'esprit, en TypeScript, avec deux ajouts que la spec impose
 * ailleurs :
 *   — `hashCorpsBrut` (§4.4) : on hache le corps BRUT, jamais `JSON.stringify(body)` ;
 *   — `empreinte` (§10.2) : ce qu'on journalise à la place d'une clé d'idempotence.
 *
 * Aucune valeur secrète n'est lue ici. Ce module ne connaît pas `process.env` :
 * il reçoit ce qu'il doit hacher. C'est ce qui le rend testable sans secret.
 */

// ---------------------------------------------------------------------------
// Hachage
// ---------------------------------------------------------------------------

export function sha256Buf(valeur: string | Buffer): Buffer {
  return createHash('sha256').update(valeur).digest()
}

export function sha256Hex(valeur: string | Buffer): string {
  return createHash('sha256').update(valeur).digest('hex')
}

export function hmacHex(secret: string, charge: string): string {
  return createHmac('sha256', secret).update(charge).digest('hex')
}

/**
 * spec-04 §4.4 — LE bug d'AMAZ à ne pas reproduire.
 *
 * `internal-signature.js` fait `sha256Hex(JSON.stringify(body))` sur un corps
 * DÉJÀ parsé par Express. Or `JSON.stringify(JSON.parse(x)) !== x` :
 *   — les espaces disparaissent : '{"a":1, "b":2}' → '{"a":1,"b":2}' ;
 *   — la notation des nombres change : '{"n":1e2}'  → '{"n":100}' ;
 *   — les échappements unicode se normalisent.
 * Deux corps différents peuvent donc produire le même hash, et deux corps
 * identiques sur le fil deux hashes différents. Le seul hash qui fait foi est
 * celui du texte reçu, lu une seule fois par `await request.text()`.
 */
export function hashCorpsBrut(corpsBrut: string): string {
  return sha256Hex(corpsBrut)
}

// ---------------------------------------------------------------------------
// Comparaisons en temps constant
// ---------------------------------------------------------------------------

/**
 * Comparaison en temps constant de deux chaînes de longueurs QUELCONQUES.
 *
 * `crypto.timingSafeEqual` exige deux buffers de même taille — c'est pour cette
 * raison qu'AMAZ passe par de l'hexadécimal de longueur fixe. On va plus loin :
 * on hache les deux côtés, donc on compare toujours 32 octets contre 32 octets,
 * et la LONGUEUR du secret ne fuit pas non plus.
 *
 * C'est la fonction à utiliser pour `x-sync-secret` et pour une signature HMAC :
 * `server.js` ligne 22 fait `header === SYNC`, une comparaison qui s'arrête au
 * premier octet différent. On ne modifie pas son fichier (lot A), on ne reproduit
 * pas son défaut chez nous.
 */
export function comparaisonConstante(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  // Une chaîne vide n'est jamais un secret valide : on refuse avant de hacher,
  // sinon sha256('') === sha256('') ferait passer deux absences pour une égalité.
  if (a.length === 0 || b.length === 0) return false
  return timingSafeEqual(sha256Buf(a), sha256Buf(b))
}

/**
 * Variante stricte pour deux chaînes hexadécimales de même longueur attendue
 * (sortie de `hmacHex`). Elle refuse tout ce qui n'est pas de l'hexadécimal :
 * un `Buffer.from('zz', 'hex')` rend un buffer vide sans lever, et un buffer
 * vide comparé à un buffer vide est « égal ». Le contrôle de forme est donc
 * une condition de correction, pas du confort.
 */
export function comparaisonHexConstante(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length === 0 || a.length !== b.length || a.length % 2 !== 0) return false
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ba.length !== bb.length || ba.length === 0) return false
  return timingSafeEqual(ba, bb)
}

// ---------------------------------------------------------------------------
// Pseudonymisation
// ---------------------------------------------------------------------------

/**
 * spec-04 §10.2 — ce qu'on journalise à la place d'une valeur sensible.
 *
 * Une `Idempotency-Key` est, pendant 24 h, un jeton qui rend une réponse
 * mémorisée. On ne la met donc jamais dans `coach_audit_logs` : on y met
 * `key_fp = sha256(clé) tronqué`. Assez pour corréler deux lignes de journal,
 * inutilisable pour rejouer quoi que ce soit.
 */
export function empreinte(valeur: string, caracteres = 16): string {
  return sha256Hex(valeur).slice(0, caracteres)
}

/**
 * Hachage poivré. Sans poivre, `sha256(ip)` est réversible par force brute sur
 * l'espace IPv4 en quelques secondes — l'anonymisation serait cosmétique
 * (spec-04 §3.5). Le poivre est fourni par l'appelant, pas lu ici.
 */
export function hachePoivre(poivre: string, valeur: string, caracteres = 32): string {
  return sha256Hex(`${poivre}:${valeur}`).slice(0, caracteres)
}

export function nouvelUuid(): string {
  return randomUUID()
}
