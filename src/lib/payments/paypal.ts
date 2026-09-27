import 'server-only'

import type { Reservation } from '@/lib/api/types'
import { nomClub } from '@/lib/clubs'
import { estUrlCheckoutSure } from '@/lib/paiement-url'

/**
 * PayPal — API Orders v2, paiement en une fois (cahier §14).
 *
 * ── LE PARCOURS ──────────────────────────────────────────────────────────
 *
 *   1. `creerCommandePaypal` : une commande pour UNE réservation, du montant
 *      FIXÉ par le serveur (`amount_cents`), jamais d'un chiffre du navigateur.
 *      `custom_id` = l'identifiant de réservation : c'est lui, lu chez PayPal,
 *      qui dit quelle réservation payer — jamais un paramètre d'URL.
 *   2. Le coach approuve chez PayPal, qui le renvoie sur notre route de retour.
 *   3. `finaliserCommande` capture l'argent — SEULEMENT si la place est encore
 *      gardée et impayée. Sinon on ne capture pas : aucun argent ne bouge.
 *   4. Le webhook refait la même chose si le coach a fermé l'onglet avant le
 *      retour, et reçoit les captures différées.
 *
 * ── CE QUI NE DOIT JAMAIS ARRIVER ────────────────────────────────────────
 *
 *   · Encaisser deux fois : vérifié AVANT la capture (place déjà payée par
 *     carte, par exemple) — et, si une capture arrive quand même pour une place
 *     qu'on ne peut plus honorer, elle est REMBOURSÉE automatiquement.
 *   · Tester avec de l'argent réel : le mode studio n'utilise que les clés
 *     TEST (bac à sable), sans repli sur les clés réelles.
 *
 * ── CONFIGURATION ────────────────────────────────────────────────────────
 *
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE (live | sandbox),
 *   PAYPAL_WEBHOOK_ID — et, pour le mode studio, PAYPAL_TEST_CLIENT_ID,
 *   PAYPAL_TEST_CLIENT_SECRET, PAYPAL_TEST_WEBHOOK_ID (toujours bac à sable).
 *   Sans clés, PayPal n'est simplement pas proposé.
 *
 *   PAYPAL_API_BASE remplace l'adresse de l'API HORS production uniquement :
 *   c'est ce qui permet d'éprouver tout le parcours contre un faux PayPal
 *   local, sans clé et sans argent.
 */

export type ConfigPaypal = {
  readonly base: string
  readonly clientId: string
  readonly secret: string
  readonly webhookId: string
  readonly test: boolean
}

export function configPaypal(test: boolean): ConfigPaypal | null {
  const e = process.env
  const clientId = (test ? e.PAYPAL_TEST_CLIENT_ID : e.PAYPAL_CLIENT_ID)?.trim()
  const secret = (test ? e.PAYPAL_TEST_CLIENT_SECRET : e.PAYPAL_CLIENT_SECRET)?.trim()
  if (!clientId || !secret) return null
  const reel = !test && e.PAYPAL_MODE?.trim().toLowerCase() === 'live'
  const remplacement = e.NODE_ENV !== 'production' ? e.PAYPAL_API_BASE?.trim().replace(/\/$/, '') : ''
  return {
    base: remplacement || (reel ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'),
    clientId,
    secret,
    webhookId: ((test ? e.PAYPAL_TEST_WEBHOOK_ID : e.PAYPAL_WEBHOOK_ID) ?? '').trim(),
    test,
  }
}

export function paypalActif(test = false): boolean {
  return configPaypal(test) !== null
}

// ── Jeton OAuth, gardé jusqu'à une minute de son expiration ───────────────
const jetons = new Map<string, { valeur: string; expire: number }>()

async function jeton(cfg: ConfigPaypal): Promise<string> {
  const cle = `${cfg.base}|${cfg.clientId}`
  const garde = jetons.get(cle)
  if (garde && garde.expire > Date.now()) return garde.valeur
  const res = await fetch(`${cfg.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  })
  const corps = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
  if (!res.ok || !corps?.access_token) throw new Error(`PayPal OAuth : HTTP ${res.status}`)
  jetons.set(cle, { valeur: corps.access_token, expire: Date.now() + Math.max(60, (corps.expires_in ?? 300) - 60) * 1000 })
  return corps.access_token
}

async function appel<T>(
  cfg: ConfigPaypal,
  chemin: string,
  options: { methode?: 'GET' | 'POST'; corps?: unknown; idempotence?: string } = {},
): Promise<{ statut: number; corps: T | null }> {
  const res = await fetch(`${cfg.base}${chemin}`, {
    method: options.methode ?? 'GET',
    headers: {
      Authorization: `Bearer ${await jeton(cfg)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
      ...(options.idempotence ? { 'PayPal-Request-Id': options.idempotence } : {}),
    },
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
    signal: AbortSignal.timeout(15_000),
  })
  return { statut: res.status, corps: (await res.json().catch(() => null)) as T | null }
}

// ── Les objets PayPal, réduits à ce qu'on lit ────────────────────────────
type Montant = { currency_code?: string; value?: string }
export type CapturePaypal = {
  id?: string
  status?: string
  amount?: Montant
  custom_id?: string
  supplementary_data?: { related_ids?: { order_id?: string } }
}
export type CommandePaypal = {
  id?: string
  status?: string
  links?: { rel?: string; href?: string }[]
  purchase_units?: { custom_id?: string; amount?: Montant; payments?: { captures?: CapturePaypal[] } }[]
}

/** « 15.00 » EUR → 1500. Toute autre devise → null : on ne convertit jamais. */
export function centimes(m: Montant | undefined): number | null {
  if (!m || m.currency_code !== 'EUR' || !/^\d+(\.\d{1,2})?$/.test(m.value ?? '')) return null
  const [e, d = ''] = (m.value as string).split('.')
  return Number(e) * 100 + Number(d.padEnd(2, '0'))
}

export function reservationDeCommande(c: CommandePaypal | null): string | null {
  return c?.purchase_units?.[0]?.custom_id?.trim() || null
}

export async function creerCommandePaypal(entree: {
  readonly reservation: Reservation
  readonly test: boolean
  readonly siteUrl: string
  readonly idempotence: string
}): Promise<{ readonly checkout_url: string; readonly id: string } | null> {
  const cfg = configPaypal(entree.test)
  if (!cfg) return null
  const r = entree.reservation
  const { statut, corps } = await appel<CommandePaypal>(cfg, '/v2/checkout/orders', {
    methode: 'POST',
    idempotence: `commande-${entree.idempotence}`,
    corps: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: r.id,
          custom_id: r.id,
          description: `Location d’un créneau d’une heure — ${nomClub(r.club_id)}`.slice(0, 127),
          amount: { currency_code: 'EUR', value: (r.amount_cents / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Boxing Center',
            locale: 'fr-FR',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            // `mode` dit quelles clés ont créé la commande : c'est avec elles
            // qu'on la capture. Le changer à la main ne donne rien — la
            // commande est introuvable avec les autres clés.
            return_url: `${entree.siteUrl}/api/v1/paiements/paypal/retour?mode=${cfg.test ? 't' : 'l'}`,
            cancel_url: `${entree.siteUrl}/espace-coach/reservations/${r.id}?annule=paypal`,
          },
        },
      },
    },
  })
  const lien = corps?.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
  if (statut >= 300 || !corps?.id || !lien || !estUrlCheckoutSure(lien)) {
    console.error('[paypal] création de commande refusée', { statut })
    return null
  }
  return { checkout_url: lien, id: corps.id }
}

export async function lireCommande(cfg: ConfigPaypal, id: string): Promise<CommandePaypal | null> {
  const { statut, corps } = await appel<CommandePaypal>(cfg, `/v2/checkout/orders/${encodeURIComponent(id)}`)
  return statut === 200 ? corps : null
}

/** Capture idempotente : rejouée, elle rend la même capture au lieu d'en créer une seconde. */
export async function capturerCommande(cfg: ConfigPaypal, id: string): Promise<CommandePaypal | null> {
  const { statut, corps } = await appel<CommandePaypal>(cfg, `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
    methode: 'POST',
    idempotence: `capture-${id}`,
    corps: {},
  })
  if (statut === 200 || statut === 201) return corps
  // Déjà capturée (autre onglet, webhook plus rapide) : on relit l'état.
  if (statut === 422) return lireCommande(cfg, id)
  console.error('[paypal] capture refusée', { statut })
  return null
}

export function captureDe(c: CommandePaypal | null): CapturePaypal | null {
  return c?.purchase_units?.[0]?.payments?.captures?.[0] ?? null
}

export async function rembourserCapture(cfg: ConfigPaypal, capture: CapturePaypal): Promise<boolean> {
  if (!capture.id) return false
  const { statut } = await appel<unknown>(cfg, `/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`, {
    methode: 'POST',
    idempotence: `remboursement-${capture.id}`,
    corps: {},
  })
  return statut === 200 || statut === 201
}

/**
 * Signature d'un webhook, vérifiée PAR PayPal (verify-webhook-signature) :
 * on n'accepte pas un événement parce qu'il a la forme d'un événement.
 * Essaie les clés réelles, puis celles du bac à sable.
 */
export async function reconnaitreWebhookPaypal(
  entetes: Headers,
  evenement: unknown,
): Promise<ConfigPaypal | null> {
  for (const cfg of [configPaypal(false), configPaypal(true)]) {
    if (!cfg?.webhookId) continue
    const { statut, corps } = await appel<{ verification_status?: string }>(
      cfg,
      '/v1/notifications/verify-webhook-signature',
      {
        methode: 'POST',
        corps: {
          auth_algo: entetes.get('paypal-auth-algo'),
          cert_url: entetes.get('paypal-cert-url'),
          transmission_id: entetes.get('paypal-transmission-id'),
          transmission_sig: entetes.get('paypal-transmission-sig'),
          transmission_time: entetes.get('paypal-transmission-time'),
          webhook_id: cfg.webhookId,
          webhook_event: evenement,
        },
      },
    ).catch(() => ({ statut: 0, corps: null }))
    if (statut === 200 && corps?.verification_status === 'SUCCESS') return cfg
  }
  return null
}
