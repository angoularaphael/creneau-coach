import { NextRequest } from 'next/server'

import { exigerSession } from '@/lib/dal/acteur'
import { lireReservation } from '@/lib/dal/reservations'
import { synchroniserPaiementPayplug } from '@/lib/payments/payplug-sync'
import { checkRateLimit, contexteRequete, refusOrigine } from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Retour navigateur après Payplug (`?paiement=retour`).
 *
 * Owner seulement. Re-query chez Payplug — jamais confiance au querystring.
 * Le webhook reste la voie normale ; ceci rattrape le cas studio / TEST où
 * la notification n'est pas encore arrivée.
 */
export async function POST(req: NextRequest, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const limite = await checkRateLimit('checkout', {
    ipHash: ctx.ipHash,
    coachId: session.valeur.acteur.id,
  })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const { id } = await ctxRoute.params
  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)

  const verdict = await synchroniserPaiementPayplug(id)
  if (verdict === 'ok' || verdict === 'replay') {
    return reponseJson({ ok: true, status: 'awaiting_signature' }, 200, ctx.requestId)
  }
  if (verdict === 'attente') {
    return reponseJson({ ok: true, status: 'held', pending: true }, 200, ctx.requestId)
  }
  if (verdict === 'mismatch') {
    return reponseErreur('CONFLICT', { raison: 'price_mismatch' }, undefined, ctx.requestId)
  }
  return reponseJson({ ok: true, status: 'held' }, 200, ctx.requestId)
}
