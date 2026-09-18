import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Marquage carte — UNIQUEMENT depuis le webhook prestataire.
 *
 * `service_role` ici n'est pas un raccourci pour un coach : il n'y a pas de
 * session. Le navigateur ne peut pas appeler cette fonction (server-only) et
 * `POST …/payment/sync` répond 404.
 */
export async function marquerPayeCarte(entree: {
  reservationId: string
  paymentId: string
  amountCents: number
  provider: 'payplug' | 'paypal'
}): Promise<'ok' | 'replay' | 'mismatch' | 'unknown'> {
  if (!UUID.test(entree.reservationId) || !entree.paymentId) return 'unknown'

  const sb = createServiceClient()
  const { data: row, error } = await sb
    .from('coach_reservations')
    .select('id, status, payment_status, payment_id, amount_cents')
    .eq('id', entree.reservationId)
    .maybeSingle()

  if (error || !row) return 'unknown'
  if (row.payment_id === entree.paymentId && row.payment_status === 'paid') return 'replay'
  if (Number(row.amount_cents) !== Number(entree.amountCents)) return 'mismatch'
  if (row.status !== 'held' || row.payment_status !== 'unpaid') return 'replay'

  const { data: maj, error: e2 } = await sb
    .from('coach_reservations')
    .update({
      payment_status: 'paid',
      payment_provider: entree.provider,
      payment_id: entree.paymentId,
      status: 'awaiting_signature',
    })
    .eq('id', entree.reservationId)
    .eq('status', 'held')
    .eq('payment_status', 'unpaid')
    .eq('amount_cents', entree.amountCents)
    .select('id')

  if (e2) return 'mismatch'
  return maj && maj.length > 0 ? 'ok' : 'replay'
}
