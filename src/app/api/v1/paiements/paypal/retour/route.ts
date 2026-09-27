import { NextResponse } from 'next/server'

import { configPaypal } from '@/lib/payments/paypal'
import { finaliserCommande } from '@/lib/payments/paypal-finaliser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Retour du coach après son approbation chez PayPal (`?token=<commande>`).
 *
 * Pas de session exigée : le coach a pu la perdre pendant le passage chez
 * PayPal, et l'argent qu'il vient d'approuver doit être traité quand même. La
 * sécurité ne vient pas de l'appelant mais de la commande : elle est relue
 * chez PayPal, et c'est elle qui désigne la réservation et le montant.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const commande = url.searchParams.get('token')?.trim() ?? ''
  const cfg = configPaypal(url.searchParams.get('mode') === 't')
  const vers = (chemin: string) => NextResponse.redirect(new URL(chemin, req.url), 303)

  if (!cfg || !/^[A-Z0-9-]{8,40}$/i.test(commande)) return vers('/espace-coach?paiement=inconnu')

  const { issue, reservationId } = await finaliserCommande(cfg, commande).catch((e) => {
    console.error('[paypal] retour', e instanceof Error ? e.message : e)
    return { issue: 'refuse' as const, reservationId: null }
  })
  if (!reservationId) return vers(`/espace-coach?paiement=${issue}`)
  if (issue === 'paye') return vers(`/espace-coach/reservations/${reservationId}/signature`)
  return vers(`/espace-coach/reservations/${reservationId}?paiement=${issue}`)
}
