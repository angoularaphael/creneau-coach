import { NextRequest } from 'next/server'

import { jsonError } from '@/lib/api/http'
import { lireReservation, payerParAvoir } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { lireMonProfil } from '@/lib/dal/profil'
import { estUrlCheckoutSure } from '@/lib/paiement-url'
import { creerPaiementPayplug } from '@/lib/payments/payplug'
import {
  checkRateLimit,
  contexteRequete,
  lireCleIdempotence,
  lireCorps,
  refusOrigine,
  schemas,
  valider,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

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

  const cle = lireCleIdempotence(req)
  if (!cle) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key (UUID v4) requis.')
  }

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.CheckoutBody, corps.json, ctx.requestId)
  if (!body.ok) return body.reponse

  const { id } = await ctxRoute.params
  const { supabase, acteur } = session.valeur

  if (body.data.provider === 'credit') {
    const paye = await payerParAvoir(ctx, supabase, id)
    if (!paye.ok) return reponseDepuisErreur(paye.erreur, ctx.requestId)
    const resa = versReservationPublique(paye.valeur as Record<string, unknown>)
    return reponseJson(
      {
        reservation_id: resa.id,
        provider: 'credit',
        status: resa.status,
      },
      200,
      ctx.requestId,
    )
  }

  const lecture = await lireReservation(ctx, supabase, acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)
  const resa = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>)

  if (resa.status !== 'held') {
    return reponseErreur('CONFLICT', { status: resa.status }, undefined, ctx.requestId)
  }

  if (body.data.provider === 'payplug') {
    const profil = await lireMonProfil(ctx, supabase, acteur)
    const hosted = await creerPaiementPayplug({
      reservation: resa,
      profil: profil.ok ? profil.valeur : null,
    })
    if (!hosted || !estUrlCheckoutSure(hosted.checkout_url)) {
      return reponseErreur(
        'PAYMENT_REQUIRED',
        { provider: 'payplug' },
        'Paiement carte non configuré. Utilisez un avoir ou contactez Boxing Center.',
        ctx.requestId,
      )
    }
    return reponseJson(
      {
        reservation_id: resa.id,
        provider: 'payplug',
        checkout_url: hosted.checkout_url,
        status: resa.status,
      },
      200,
      ctx.requestId,
    )
  }

  return reponseErreur(
    'PAYMENT_REQUIRED',
    { provider: body.data.provider },
    'Ce prestataire n’est pas encore branché. Utilisez un avoir ou Payplug.',
    ctx.requestId,
  )
}
