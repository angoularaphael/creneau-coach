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

function payplugKey(): string {
  const forceTest = (process.env.PAYPLUG_FORCE_TEST ?? '').trim() === '1'
  if (forceTest && process.env.PAYPLUG_TEST_SECRET_KEY) {
    return process.env.PAYPLUG_TEST_SECRET_KEY
  }
  return process.env.PAYPLUG_SECRET_KEY || process.env.PAYPLUG_TEST_SECRET_KEY || ''
}

export function payplugActif(): boolean {
  return Boolean(payplugKey())
}

export async function creerPaiementPayplug(entree: {
  reservation: Reservation
  profil?: Profil | null
}): Promise<{ checkout_url: string } | null> {
  const key = payplugKey()
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
        return_url: `${base}/espace-coach/reservations/${entree.reservation.id}`,
        cancel_url: `${base}/espace-coach/reservations/${entree.reservation.id}?cancelled=1`,
      },
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    hosted_payment?: { payment_url?: string }
  } | null
  const url = body?.hosted_payment?.payment_url
  if (!res.ok || !url || !estUrlCheckoutSure(url)) return null
  return { checkout_url: url }
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

export function verifierSignaturePayplug(corpsBrut: Buffer, header: string | null): boolean {
  const sig = (header ?? '').trim()
  const key = payplugKey()
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

export function paiementPayplugRegle(payment: PaiementPayplug | null | undefined): boolean {
  if (!payment || payment.failure) return false
  if (payment.is_paid === true) return true
  const authorizedAt = payment.authorization?.authorized_at || payment.authorized_at
  const pending = payment.payment_method?.is_pending === true
  return Boolean(authorizedAt) && !pending && payment.auto_capture !== false
}

export async function recupererPaiementPayplug(id: string): Promise<PaiementPayplug | null> {
  const key = payplugKey()
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
