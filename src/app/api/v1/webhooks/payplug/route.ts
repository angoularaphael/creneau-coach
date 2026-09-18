import { jsonError, jsonOk } from '@/lib/api/http'
import { marquerPayeCarte } from '@/lib/dal/paiements'
import {
  paiementPayplugRegle,
  recupererPaiementPayplug,
  reconnaitreWebhookPayplug,
} from '@/lib/payments/payplug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Notification Payplug. Pas de cookie, pas d'Origin : la signature HMAC +
 * re-lecture du paiement chez Payplug font foi. Un POST navigateur ne passe pas.
 */
export async function POST(req: Request) {
  const brut = Buffer.from(await req.arrayBuffer())
  const sig =
    req.headers.get('payplug-signature') ?? req.headers.get('PayPlug-Signature')
  const reconnu = reconnaitreWebhookPayplug(brut, sig)
  if (!reconnu) {
    return jsonError(401, 'WEBHOOK_INVALID', 'Signature Payplug refusée.')
  }

  let parsed: { id?: string } = {}
  try {
    parsed = JSON.parse(brut.toString('utf8') || '{}') as { id?: string }
  } catch {
    return jsonOk({ ok: true, ignored: true })
  }

  const paymentId = String(parsed.id || '').trim()
  if (!paymentId) return jsonOk({ ok: true, ignored: true })

  const payment = await recupererPaiementPayplug(paymentId, reconnu.test)
  if (!payment) return jsonError(401, 'WEBHOOK_INVALID', 'Paiement Payplug illisible.')

  const reservationId = String(payment.metadata?.reservation_id || '').trim()
  if (!reservationId) return jsonOk({ ok: true, ignored: true })

  if (payment.failure) {
    return jsonOk({ ok: true, failed: true })
  }
  if (!paiementPayplugRegle(payment)) {
    return jsonOk({ ok: true, pending: true })
  }

  const verdict = await marquerPayeCarte({
    reservationId,
    paymentId: payment.id || paymentId,
    amountCents: Number(payment.amount),
    provider: 'payplug',
  })

  if (verdict === 'mismatch') {
    return jsonError(409, 'PRICE_MISMATCH', 'Montant ou réservation incohérents.')
  }
  return jsonOk({ ok: true, status: verdict })
}
