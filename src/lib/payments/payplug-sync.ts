import 'server-only'

import {
  lirePaiementEnCours,
  marquerPayeCarte,
  type VerdictPaiement,
} from '@/lib/dal/paiements'
import { prevenirASigner } from '@/lib/mail/transactionnel'
import {
  paiementPayplugRegle,
  recupererPaiementPayplugQuelconque,
  trouverPaiementPayplugPourReservation,
} from '@/lib/payments/payplug'

/**
 * Au retour du checkout Payplug : on re-lit le paiement CHEZ Payplug.
 *
 * Le webhook est la voie normale. En studio (TEST), il n'arrive souvent pas
 * avant le retour navigateur : sans cette re-lecture, le coach revient sur une
 * place encore « à payer » alors que la carte TEST a déjà passé.
 *
 * On ne croit jamais le querystring : seulement `is_paid` / autorisation
 * renvoyés par l'API Payplug.
 */
export async function synchroniserPaiementPayplug(
  reservationId: string,
): Promise<VerdictPaiement | 'attente' | 'rien'> {
  const etat = await lirePaiementEnCours(reservationId)
  if (!etat) return 'unknown'
  if (etat.payment_status === 'paid') return 'replay'
  if (etat.status !== 'held' || etat.payment_status !== 'unpaid') return 'indisponible'

  let paymentId = etat.payment_id
  let payment = paymentId ? await recupererPaiementPayplugQuelconque(paymentId) : null

  if (!payment || !paiementPayplugRegle(payment.payment)) {
    const retrouve = await trouverPaiementPayplugPourReservation(reservationId)
    if (retrouve) {
      payment = retrouve
      paymentId = String(retrouve.payment.id || '').trim() || paymentId
    }
  }

  if (!payment?.payment) return 'rien'
  if (!paiementPayplugRegle(payment.payment)) {
    if (payment.payment.failure) return 'indisponible'
    return 'attente'
  }
  if (!paymentId) return 'rien'

  const verdict = await marquerPayeCarte({
    reservationId,
    paymentId,
    amountCents: Number(payment.payment.amount),
    provider: 'payplug',
  })
  if (verdict === 'ok') await prevenirASigner(reservationId)
  return verdict
}
