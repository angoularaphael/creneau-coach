import 'server-only'

import type { Reservation } from '@/lib/api/types'
import type { Profil } from '@/lib/dal/profil'

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
  if (!res.ok || !url) return null
  return { checkout_url: url }
}
