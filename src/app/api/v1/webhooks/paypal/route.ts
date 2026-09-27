import { jsonError, jsonOk } from '@/lib/api/http'
import { reconnaitreWebhookPaypal, type CapturePaypal } from '@/lib/payments/paypal'
import { enregistrerCapture, finaliserCommande } from '@/lib/payments/paypal-finaliser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Notifications PayPal. Pas de cookie, pas d'Origin : la signature est vérifiée
 * PAR PayPal (verify-webhook-signature) avant toute lecture du contenu.
 *
 *   CHECKOUT.ORDER.APPROVED    le coach a approuvé mais n'est pas revenu (onglet
 *                              fermé) : on finalise comme au retour ;
 *   PAYMENT.CAPTURE.COMPLETED  une capture aboutit (y compris différée) : on la
 *                              rattache, ou on la rembourse.
 *
 * Tout le reste est accusé et ignoré. Rejouer une notification ne crée rien.
 * Le mode (réel ou bac à sable) est celui des clés qui ont vérifié la signature.
 */
export async function POST(req: Request) {
  let evenement: {
    event_type?: string
    resource?: { id?: string; custom_id?: string } & CapturePaypal
  }
  try {
    evenement = JSON.parse(await req.text())
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Notification illisible.')
  }

  const cfg = await reconnaitreWebhookPaypal(req.headers, evenement)
  if (!cfg) return jsonError(401, 'WEBHOOK_INVALID', 'Signature PayPal refusée.')

  const r = evenement.resource ?? {}
  if (evenement.event_type === 'CHECKOUT.ORDER.APPROVED' && r.id) {
    const { issue } = await finaliserCommande(cfg, r.id)
    return jsonOk({ ok: true, issue })
  }
  if (evenement.event_type === 'PAYMENT.CAPTURE.COMPLETED' && r.custom_id) {
    const { issue } = await enregistrerCapture(cfg, r.custom_id, r)
    return jsonOk({ ok: true, issue })
  }
  return jsonOk({ ok: true, ignored: true })
}
