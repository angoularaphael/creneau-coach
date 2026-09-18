import { NextRequest } from 'next/server'

import { jsonError } from '@/lib/api/http'
import { annulerReservation, lireReservation } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import {
  checkRateLimit,
  contexteRequete,
  lireCleIdempotence,
  refusOrigine,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseDepuisErreur, reponseJson } from '@/lib/http/erreurs'
import {
  doitRevoquerDeciplus,
  envoyerJobDeciplus,
  reservationVersJob,
} from '@/lib/bot/forward'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const limite = await checkRateLimit('reservations', {
    ipHash: ctx.ipHash,
    coachId: session.valeur.acteur.id,
  })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const cle = lireCleIdempotence(req)
  if (!cle) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key (UUID v4) requis.')
  }

  const { id } = await ctxRoute.params
  const avant = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  const resultat = await annulerReservation(ctx, session.valeur.supabase, {
    reservationId: id,
    idempotencyKey: cle,
  })
  if (!resultat.ok) return reponseDepuisErreur(resultat.erreur, ctx.requestId)

  if (avant.ok && doitRevoquerDeciplus(avant.valeur.deciplus_job_status)) {
    void envoyerJobDeciplus(
      reservationVersJob(avant.valeur as unknown as Record<string, unknown>, 'coach_revoke'),
    ).catch((e) => {
      console.warn('[deciplus] enqueue revoke', e instanceof Error ? e.message : e)
    })
  }

  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) {
    return reponseJson(resultat.valeur, 200, ctx.requestId)
  }
  return reponseJson(
    versReservationPublique(lecture.valeur as unknown as Record<string, unknown>),
    200,
    ctx.requestId,
  )
}
