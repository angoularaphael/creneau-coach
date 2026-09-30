import 'server-only'

import { lireEtatPaiement, marquerPayeCarte } from '@/lib/dal/paiements'
import { prevenirASigner } from '@/lib/mail/transactionnel'
import { createServiceClient } from '@/lib/supabase/service'

import {
  captureDe,
  capturerCommande,
  centimes,
  lireCommande,
  rembourserCapture,
  reservationDeCommande,
  type CapturePaypal,
  type ConfigPaypal,
} from './paypal'

/**
 * L'issue d'un paiement PayPal, telle que le coach la lit :
 *   paye       réservation payée → signature ;
 *   attente    PayPal valide encore le paiement (rare) ;
 *   deja       la réservation était déjà payée : AUCUN second paiement pris ;
 *   expire     le délai de l'option est passé : AUCUN paiement pris ;
 *   refuse     paiement refusé ou abandonné : aucun paiement pris ;
 *   rembourse  un paiement est arrivé sans place à honorer : remboursé ;
 *   erreur     remboursement impossible — Boxing Center est alerté ;
 *   inconnu    commande introuvable.
 */
export type IssuePaypal = 'paye' | 'attente' | 'deja' | 'expire' | 'refuse' | 'rembourse' | 'erreur' | 'inconnu'

export type ResultatPaypal = { readonly issue: IssuePaypal; readonly reservationId: string | null }

/**
 * Après l'approbation du coach : vérifier, PUIS capturer.
 *
 * L'ordre est la garantie. On lit la commande chez PayPal (la réservation vient
 * de son `custom_id`, pas de l'URL), on vérifie que la place attend encore ce
 * paiement, pour ce montant, dans le délai — et seulement alors on capture.
 * Un refus avant capture ne déplace aucun argent : l'autorisation du coach
 * expire d'elle-même chez PayPal.
 */
export async function finaliserCommande(cfg: ConfigPaypal, commandeId: string): Promise<ResultatPaypal> {
  const commande = await lireCommande(cfg, commandeId)
  const reservationId = reservationDeCommande(commande)
  if (!commande || !reservationId) return { issue: 'inconnu', reservationId: null }

  let capture = captureDe(commande)
  if (!capture) {
    if (commande.status !== 'APPROVED') return { issue: 'refuse', reservationId }

    const etat = await lireEtatPaiement(reservationId)
    if (!etat) return { issue: 'inconnu', reservationId: null }
    if (etat.status !== 'held' || etat.payment_status !== 'unpaid') return { issue: 'deja', reservationId }
    if (etat.hold_expires_at && new Date(etat.hold_expires_at).getTime() <= Date.now()) {
      return { issue: 'expire', reservationId }
    }
    if (centimes(commande.purchase_units?.[0]?.amount) !== etat.amount_cents) {
      console.error('[paypal] montant de commande différent du prix fixé — pas de capture', { reservationId })
      return { issue: 'refuse', reservationId }
    }

    capture = captureDe(await capturerCommande(cfg, commandeId))
    if (!capture) return { issue: 'refuse', reservationId }
  }

  return enregistrerCapture(cfg, reservationId, capture)
}

/**
 * Rattacher une capture à sa réservation — ou la rembourser.
 *
 * Appelée au retour du coach et par le webhook `PAYMENT.CAPTURE.COMPLETED` :
 * rejouée, elle ne fait rien de plus (même capture = même `payment_id`).
 */
export async function enregistrerCapture(
  cfg: ConfigPaypal,
  reservationId: string,
  capture: CapturePaypal,
): Promise<ResultatPaypal> {
  if (capture.status === 'PENDING') return { issue: 'attente', reservationId }
  if (capture.status !== 'COMPLETED' || !capture.id) return { issue: 'refuse', reservationId }

  const montant = centimes(capture.amount)
  const verdict =
    montant === null
      ? 'mismatch'
      : await marquerPayeCarte({ reservationId, paymentId: capture.id, amountCents: montant, provider: 'paypal' })
  if (verdict === 'ok') await prevenirASigner(reservationId)
  if (verdict === 'ok' || verdict === 'replay') return { issue: 'paye', reservationId }

  // De l'argent sans place en face : on le rend.
  const rendu = await rembourserCapture(cfg, capture).catch(() => false)
  await createServiceClient()
    .from('coach_audit_logs')
    .insert({
      role: 'service',
      action: rendu ? 'payment.refunded' : 'payment.refund_failed',
      target_type: 'reservation',
      target_id: reservationId,
      meta: { provider: 'paypal', capture_id: capture.id, verdict, montant_cents: montant },
    })
    .then(({ error }) => {
      if (error) console.error('[paypal] audit', error.message)
    })
  if (!rendu) {
    console.error('[paypal] REMBOURSEMENT À FAIRE À LA MAIN', { reservationId, captureId: capture.id, verdict })
    return { issue: 'erreur', reservationId }
  }
  return { issue: 'rembourse', reservationId }
}
