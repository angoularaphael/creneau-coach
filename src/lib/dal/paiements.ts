import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 *   ok            le paiement est rattaché : la réservation passe à la signature ;
 *   replay        CE MÊME paiement était déjà rattaché (notification rejouée) ;
 *   mismatch      montant différent du prix fixé — rien n'est rattaché ;
 *   indisponible  la réservation n'attend plus de paiement (déjà payée
 *                 autrement, expirée, annulée) : ce paiement est EN TROP ;
 *   unknown       réservation introuvable.
 */
export type VerdictPaiement = 'ok' | 'replay' | 'mismatch' | 'indisponible' | 'unknown'

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
}): Promise<VerdictPaiement> {
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
  // Payée autrement, expirée ou annulée : CE paiement-ci ne peut pas être
  // rattaché. Ce n'est pas un rejeu — c'est un paiement à rembourser.
  if (row.status !== 'held' || row.payment_status !== 'unpaid') return 'indisponible'

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
  // Course perdue entre la lecture et l'écriture : un autre paiement est passé.
  return maj && maj.length > 0 ? 'ok' : 'indisponible'
}

/**
 * Ce que le paiement doit savoir d'une réservation AVANT d'encaisser : est-elle
 * encore une option en attente de paiement, et pour quel montant ?
 */
export async function lireEtatPaiement(reservationId: string): Promise<{
  readonly status: string
  readonly payment_status: string
  readonly hold_expires_at: string | null
  readonly amount_cents: number
} | null> {
  if (!UUID.test(reservationId)) return null
  const { data, error } = await createServiceClient()
    .from('coach_reservations')
    .select('status, payment_status, hold_expires_at, amount_cents')
    .eq('id', reservationId)
    .maybeSingle()
  if (error || !data) return null
  return {
    status: String(data.status),
    payment_status: String(data.payment_status),
    hold_expires_at: data.hold_expires_at ? String(data.hold_expires_at) : null,
    amount_cents: Number(data.amount_cents),
  }
}
