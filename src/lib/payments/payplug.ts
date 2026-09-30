import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Reservation } from '@/lib/api/types'
import type { Profil } from '@/lib/dal/profil'
import { estUrlCheckoutSure } from '@/lib/paiement-url'

function siteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3041'
  ).replace(/\/$/, '')
}

function clesPayplug(): { live: string; test: string } {
  return {
    live: (process.env.PAYPLUG_SECRET_KEY ?? '').trim(),
    test: (process.env.PAYPLUG_TEST_SECRET_KEY ?? '').trim(),
  }
}

function forcerTestGlobal(): boolean {
  return (process.env.PAYPLUG_FORCE_TEST ?? '').trim() === '1'
}

export function clePayplug(test = false): string {
  const { live, test: testKey } = clesPayplug()
  if ((test || forcerTestGlobal()) && testKey) return testKey
  return live || testKey
}

export function payplugActif(test = false): boolean {
  return Boolean(clePayplug(test))
}

export async function creerPaiementPayplug(entree: {
  reservation: Reservation
  profil?: Profil | null
  test?: boolean
}): Promise<{ checkout_url: string; payment_id: string } | null> {
  const key = clePayplug(Boolean(entree.test))
  if (!key) return null
  const base = siteUrl()
  const billing = {
    first_name: entree.profil?.first_name || 'Coach',
    last_name: entree.profil?.last_name || 'Boxing',
    email: entree.profil?.email || undefined,
    address1: entree.profil?.address_line || 'Boxing Center',
    postcode: entree.profil?.postal_code || '31000',
    city: entree.profil?.city || 'Toulouse',
    country: 'FR',
    language: 'fr',
  }
  const res = await fetch('https://api.payplug.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'PayPlug-Version': process.env.PAYPLUG_API_VERSION || '2019-08-06',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount: entree.reservation.amount_cents,
      currency: 'EUR',
      billing,
      shipping: { ...billing, delivery_type: 'BILLING' },
      description: `Créneau ${entree.reservation.club_id}`.slice(0, 80),
      metadata: {
        reservation_id: entree.reservation.id,
        club_id: entree.reservation.club_id,
        payment_plan: 'once',
      },
      notification_url: `${base}/api/v1/webhooks/payplug`,
      hosted_payment: {
        // `paiement=retour` : au retour, la page re-lit Payplug (le webhook
        // TEST n'arrive pas toujours à temps, surtout en studio).
        return_url: `${base}/espace-coach/reservations/${entree.reservation.id}?paiement=retour`,
        cancel_url: `${base}/espace-coach/reservations/${entree.reservation.id}?cancelled=1`,
      },
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    id?: string
    hosted_payment?: { payment_url?: string }
  } | null
  const url = body?.hosted_payment?.payment_url
  const paymentId = String(body?.id || '').trim()
  if (!res.ok || !url || !paymentId || !estUrlCheckoutSure(url)) return null
  return { checkout_url: url, payment_id: paymentId }
}

export type PaiementPayplug = {
  id?: string
  amount?: number
  is_paid?: boolean
  failure?: unknown
  auto_capture?: boolean
  authorized_at?: string
  authorization?: { authorized_at?: string }
  payment_method?: { is_pending?: boolean }
  metadata?: { reservation_id?: string }
}

function hmacPayplug(corpsBrut: Buffer, header: string, key: string): boolean {
  const sig = header.trim()
  if (!sig || !key) return false
  const parts = sig.split('.')
  if (parts.length !== 3) return false
  const data = `${parts[0]}.${parts[1]}`
  const mac = parts[2]
  if (!mac) return false
  const expected = createHmac('sha256', key).update(data).digest('base64url')
  const got = Buffer.from(mac)
  const exp = Buffer.from(expected)
  if (got.length !== exp.length || got.length === 0) return false
  return timingSafeEqual(got, exp)
}

/** Le webhook n'a pas le cookie studio : on essaie live puis TEST. */
export function reconnaitreWebhookPayplug(
  corpsBrut: Buffer,
  header: string | null,
): { test: boolean } | null {
  const sig = (header ?? '').trim()
  if (!sig) return null
  const { live, test } = clesPayplug()
  if (live && hmacPayplug(corpsBrut, sig, live)) return { test: false }
  if (test && hmacPayplug(corpsBrut, sig, test)) return { test: true }
  return null
}

export function verifierSignaturePayplug(corpsBrut: Buffer, header: string | null): boolean {
  return reconnaitreWebhookPayplug(corpsBrut, header) !== null
}

export function paiementPayplugRegle(payment: PaiementPayplug | null | undefined): boolean {
  if (!payment || payment.failure) return false
  if (payment.is_paid === true) return true
  const authorizedAt = payment.authorization?.authorized_at || payment.authorized_at
  const pending = payment.payment_method?.is_pending === true
  return Boolean(authorizedAt) && !pending && payment.auto_capture !== false
}

export async function recupererPaiementPayplug(
  id: string,
  test = false,
): Promise<PaiementPayplug | null> {
  const key = clePayplug(test)
  if (!key || !id) return null
  const res = await fetch(`https://api.payplug.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'PayPlug-Version': process.env.PAYPLUG_API_VERSION || '2019-08-06',
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  return (await res.json().catch(() => null)) as PaiementPayplug | null
}

/** Re-lecture sans savoir si le checkout était TEST ou live (retour studio). */
export async function recupererPaiementPayplugQuelconque(
  id: string,
): Promise<{ payment: PaiementPayplug; test: boolean } | null> {
  for (const test of [true, false] as const) {
    const payment = await recupererPaiementPayplug(id, test)
    if (payment?.id) return { payment, test }
  }
  return null
}

/**
 * Dernier filet : le webhook n'est pas passé et l'id n'a pas été mémorisé
 * (checkout lancé avant ce correctif). On cherche un paiement réglé qui porte
 * cette réservation dans ses métadonnées.
 */
export async function trouverPaiementPayplugPourReservation(
  reservationId: string,
): Promise<{ payment: PaiementPayplug; test: boolean } | null> {
  const { live, test: testKey } = clesPayplug()
  for (const [test, key] of [
    [true, testKey],
    [false, live],
  ] as const) {
    if (!key) continue
    const res = await fetch('https://api.payplug.com/v1/payments?page_size=50', {
      headers: {
        Authorization: `Bearer ${key}`,
        'PayPlug-Version': process.env.PAYPLUG_API_VERSION || '2019-08-06',
        Accept: 'application/json',
      },
    })
    if (!res.ok) continue
    const body = (await res.json().catch(() => null)) as {
      data?: PaiementPayplug[]
    } | null
    const trouve = (body?.data ?? []).find(
      (p) =>
        String(p.metadata?.reservation_id || '') === reservationId &&
        paiementPayplugRegle(p),
    )
    if (trouve) return { payment: trouve, test }
  }
  return null
}
