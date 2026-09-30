import { NextRequest } from 'next/server'

import { jsonError } from '@/lib/api/http'
import { lireReservation, payerParAvoir } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { lireMonProfil } from '@/lib/dal/profil'
import { estUrlCheckoutSure } from '@/lib/paiement-url'
import { creerPaiementPayplug } from '@/lib/payments/payplug'
import { creerCommandePaypal } from '@/lib/payments/paypal'
import { studioActif } from '@/lib/studio/session'
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
import { MESSAGE_DOCUMENTS_EN_ATTENTE, documentsPublies } from '@/lib/documents/obligatoires'
import { prevenirASigner } from '@/lib/mail/transactionnel'

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

  // Seconde barrière, au moment exact où l'argent part : un document a pu être
  // dépublié entre la prise d'option et le paiement.
  if (!(await documentsPublies())) {
    return reponseErreur(
      'CONFLICT',
      { raison: 'documents_non_publies' },
      MESSAGE_DOCUMENTS_EN_ATTENTE,
      ctx.requestId,
    )
  }

  if (body.data.provider === 'credit') {
    const paye = await payerParAvoir(ctx, supabase, id)
    if (!paye.ok) return reponseDepuisErreur(paye.erreur, ctx.requestId)
    const resa = versReservationPublique(paye.valeur as Record<string, unknown>)
    if (resa.status === 'awaiting_signature') await prevenirASigner(resa.id)
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
      test: await studioActif(),
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

  if (body.data.provider === 'paypal') {
    const commande = await creerCommandePaypal({
      reservation: resa,
      test: await studioActif(),
      siteUrl: (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, ''),
      idempotence: cle,
    }).catch((e) => {
      console.error(`[${ctx.requestId}] paypal`, e instanceof Error ? e.message : e)
      return null
    })
    if (!commande) {
      return reponseErreur(
        'PAYMENT_REQUIRED',
        { provider: 'paypal' },
        'PayPal est momentanément indisponible. Payez par carte ou avec un avoir.',
        ctx.requestId,
      )
    }
    return reponseJson(
      {
        reservation_id: resa.id,
        provider: 'paypal',
        checkout_url: commande.checkout_url,
        status: resa.status,
      },
      200,
      ctx.requestId,
    )
  }

  return reponseErreur(
    'PAYMENT_REQUIRED',
    { provider: body.data.provider },
    'Moyen de paiement inconnu. Payez par carte, PayPal ou avec un avoir.',
    ctx.requestId,
  )
}
