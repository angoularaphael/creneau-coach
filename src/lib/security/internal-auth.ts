import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

import { comparaisonConstante, hashCorpsBrut, hmacHex } from './crypto'

/**
 * Authentification des routes `/internal/*` — spec-04 §5.
 *
 * ═══ L'ÉTAT DES LIEUX, QU'ON NE MODIFIE PAS ═══
 * `server.js` ligne 22 (lot A, Raphael) :
 *     return Boolean(SYNC) && header === SYNC;
 * `header === SYNC` s'arrête au premier octet différent : c'est une comparaison
 * non constante en temps. On ne touche pas à son fichier — c'est la faute la plus
 * grave de ce projet — mais on ne reproduit pas son défaut de notre côté.
 *
 * ═══ ON EMPILE, ON NE REMPLACE PAS ═══
 * Le cahier §1.2 impose `x-sync-secret`. Le bot de Raphael l'envoie déjà. Casser
 * ça n'est pas une option. D'où trois phases :
 *
 *   Phase 1 — immédiate, zéro changement pour Raphael. `x-sync-secret` seul,
 *             mais comparé en temps constant, refusé si absent ou vide, et
 *             journalisé à chaque appel.
 *   Phase 2 — additive, opt-in. Si l'appelant envoie AUSSI les quatre en-têtes de
 *             signature, on les vérifie et un échec vaut 401. S'il ne les envoie
 *             pas, on retombe sur la phase 1. Un bot non migré continue de
 *             marcher ; un bot migré est strictement plus sûr.
 *   Phase 3 — bascule. `INTERNAL_REQUIRE_SIGNATURE=1` dans l'environnement Vercel
 *             et un appel sans signature est refusé. Réversible en une variable,
 *             sans redéploiement.
 *
 * ═══ CE QUE ÇA NE PROTÈGE PAS ═══
 * Un secret partagé ne dit pas QUI appelle, seulement que l'appelant le connaît.
 * En phase 2, `x-internal-service` est couvert par le HMAC, donc l'identité de
 * service devient authentifiée — mais tous les services partagent la même clé,
 * donc l'un peut se faire passer pour l'autre. Il n'y a qu'un bot aujourd'hui :
 * sans conséquence. À relire le jour où un deuxième appelant interne apparaît.
 */

const DERIVE_MAX_MS = 60_000
const TTL_NONCE_MS = 2 * DERIVE_MAX_MS // §5.4 : TTL = 2 × la dérive tolérée.

function secretPartage(): string {
  return (process.env.SYNC_SECRET ?? '').trim()
}

function signatureExigee(): boolean {
  return process.env.INTERNAL_REQUIRE_SIGNATURE === '1'
}

export type RaisonRefusInterne =
  | 'bad_sync_secret'
  | 'signature_required'
  | 'signature_incomplete'
  | 'clock_drift'
  | 'bad_signature'
  | 'nonce_replay'
  | 'nonce_store_unavailable'

export type ResultatAuthInterne =
  | { readonly ok: true; readonly service: string; readonly signed: boolean }
  | {
      readonly ok: false
      /**
       * 503 est une SORTIE HORS ENUM `ErrorCode` (spec-04 §6.4 : l'enum n'a
       * aucun code pour un 5xx). Elle n'apparaît que sur `/internal/*`, qui n'est
       * pas une surface navigateur et n'est pas décrite par `openapi.yaml` côté
       * corps d'erreur. Signalée en §12 comme question ouverte.
       */
      readonly status: 401 | 403 | 409 | 503
      readonly reason: RaisonRefusInterne
    }

/**
 * `rawBody` DOIT être le corps brut, lu une seule fois par `await request.text()`
 * AVANT tout `JSON.parse`. C'est la correction du bug d'AMAZ (spec-04 §4.4) :
 * `sha256(JSON.stringify(JSON.parse(x)))` n'est pas `sha256(x)`.
 */
export async function verifyInternalRequest(
  req: Request,
  rawBody: string,
): Promise<ResultatAuthInterne> {
  const attendu = secretPartage()
  const presente = (req.headers.get('x-sync-secret') ?? '').trim()

  // ── Phase 1 : le secret partagé, toujours exigé ──
  // Le `Boolean(SYNC) &&` de `server.js` est correct et on le garde explicitement :
  // sans lui, un serveur mal configuré (secret vide des deux côtés) accepterait
  // tout le monde. Un secret absent côté serveur ferme la porte, il ne l'ouvre pas.
  if (!attendu || !presente || !comparaisonConstante(presente, attendu)) {
    return { ok: false, status: 401, reason: 'bad_sync_secret' }
  }

  // ── Phase 2 : signature HMAC, si l'appelant la présente ──
  const service = (req.headers.get('x-internal-service') ?? '').trim()
  const tsBrut = req.headers.get('x-internal-timestamp')
  const nonce = (req.headers.get('x-internal-nonce') ?? '').trim()
  const signature = (req.headers.get('x-internal-signature') ?? '').trim()

  const tentativeSignee = Boolean(service || tsBrut || nonce || signature)

  if (!tentativeSignee) {
    if (signatureExigee()) return { ok: false, status: 401, reason: 'signature_required' }
    return { ok: true, service: 'legacy', signed: false }
  }

  // Signature PARTIELLEMENT présente : c'est une tentative, donc on est strict.
  // Accepter un appel à qui il manque le nonce reviendrait à laisser désactiver
  // l'anti-rejeu en retirant un en-tête.
  const ts = Number(tsBrut)
  if (!service || !Number.isFinite(ts) || !nonce || !signature) {
    return { ok: false, status: 401, reason: 'signature_incomplete' }
  }

  if (Math.abs(Date.now() - ts) > DERIVE_MAX_MS) {
    // Le bot tourne sur BotHosting, pas sur Vercel : sa montre est indépendante.
    // ±60 s est généreux et suffisant.
    return { ok: false, status: 401, reason: 'clock_drift' }
  }

  const url = new URL(req.url)
  // ATTENTION : `path_et_query` vient de `new URL(request.url)`, PAS de
  // `req.originalUrl` (qui n'existe pas hors Express). Next NORMALISE les URL —
  // c'est la raison d'être de `skipProxyUrlNormalize`. Donc : AUCUN rewrite sur
  // `/internal/*`, sans quoi la signature casse silencieusement.
  const canonique = [
    'v1',
    service,
    req.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    String(ts),
    nonce,
    hashCorpsBrut(rawBody),
  ].join(':')

  const attenduHex = hmacHex(attendu, canonique)
  if (!comparaisonConstante(attenduHex, signature)) {
    return { ok: false, status: 401, reason: 'bad_signature' }
  }

  // ── Anti-rejeu : atomique, la base tranche ──
  // `nonceStore.has()` puis `nonceStore.set()` (AMAZ) est une condition de course
  // même en mono-processus, et un `Map` de processus ne survit pas au serverless.
  const rejeu = await consommerNonce(nonce, service)
  if (rejeu !== 'ok') {
    return {
      ok: false,
      status: rejeu === 'rejeu' ? 409 : 503,
      reason: rejeu === 'rejeu' ? 'nonce_replay' : 'nonce_store_unavailable',
    }
  }

  return { ok: true, service, signed: true }
}

/**
 * `insert … on conflict do nothing returning` : zéro ligne rendue = nonce déjà
 * vu = rejeu. Deux requêtes simultanées avec le même nonce ne peuvent pas passer
 * toutes les deux.
 *
 * SI LA TABLE N'EXISTE PAS, ON ÉCHOUE FERMÉ. Un appelant qui présente une
 * signature a droit à une vérification complète : servir sa requête sans pouvoir
 * contrôler le rejeu, ce serait annoncer une protection qu'on n'applique pas.
 * On ne retombe surtout pas en phase 1 — ce serait un contournement déclenchable
 * en faisant tomber une table.
 */
async function consommerNonce(
  nonce: string,
  service: string,
): Promise<'ok' | 'rejeu' | 'indisponible'> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('coach_internal_nonces')
      .upsert(
        {
          nonce,
          service,
          expires_at: new Date(Date.now() + TTL_NONCE_MS).toISOString(),
        },
        { onConflict: 'nonce', ignoreDuplicates: true },
      )
      .select('nonce')

    if (error) {
      console.error('[internal-auth] magasin de nonces indisponible', { code: error.code })
      return 'indisponible'
    }
    return data && data.length > 0 ? 'ok' : 'rejeu'
  } catch (e) {
    console.error('[internal-auth] exception sur le magasin de nonces', e)
    return 'indisponible'
  }
}

/**
 * Charge canonique à SIGNER côté appelant. Exportée pour que le client HTTP signé
 * livré à Raphael (spec-04 §1, `internal-http.js` « ADAPTE — utile pour Raphael »)
 * produise exactement ce que `verifyInternalRequest` recalcule. Deux
 * implémentations de la même chaîne finissent toujours par diverger ; il n'y en a
 * donc qu'une, et elle est ici.
 */
export function chargeCanonique(entree: {
  readonly service: string
  readonly methode: string
  readonly cheminEtQuery: string
  readonly timestampMs: number
  readonly nonce: string
  readonly corpsBrut: string
}): string {
  return [
    'v1',
    entree.service,
    entree.methode.toUpperCase(),
    entree.cheminEtQuery,
    String(entree.timestampMs),
    entree.nonce,
    hashCorpsBrut(entree.corpsBrut),
  ].join(':')
}

/** Statut HTTP d'un refus interne, avec le corps du contrat §1.3. */
export function reponseRefusInterne(
  resultat: Extract<ResultatAuthInterne, { ok: false }>,
  requestId: string,
): Response {
  const code =
    resultat.status === 409 ? 'CONFLICT' : resultat.status === 503 ? 'CONFLICT' : 'UNAUTHENTICATED'

  const corps = {
    error: {
      code,
      // Le message ne dit JAMAIS ce qui a échoué : « mauvaise signature » et
      // « nonce rejoué » renseignent un attaquant sur l'état de sa tentative.
      // La vraie raison part dans `coach_audit_logs`, pas sur le fil.
      message: 'Requête interne refusée.',
      details: { request_id: requestId },
    },
  }
  return new Response(JSON.stringify(corps), {
    status: resultat.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId },
  })
}
