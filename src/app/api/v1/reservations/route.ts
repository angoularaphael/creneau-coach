import { NextRequest } from 'next/server'

import { jsonError } from '@/lib/api/http'
import { versReservationPublique } from '@/lib/dal/map'
import { creerHold, listerReservations } from '@/lib/dal/reservations'
import { exigerSession } from '@/lib/dal/acteur'
import {
  checkRateLimit,
  contexteRequete,
  lireCleIdempotence,
  lireCorps,
  reponse429,
  schemas,
  valider,
} from '@/lib/security'
import { auditDeny, auditOk } from '@/lib/security/audit'
import { reponseDepuisErreur, reponseJson } from '@/lib/http/erreurs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const url = new URL(req.url)
  const brut: Record<string, string> = {}
  for (const cle of ['from', 'to', 'status', 'limit', 'cursor'] as const) {
    const v = url.searchParams.get(cle)
    if (v) brut[cle] = v
  }
  const q = valider(schemas.ListReservationsQuery, brut, ctx.requestId)
  if (!q.ok) return q.reponse

  const page = await listerReservations(ctx, session.valeur.supabase, q.data, {
    clubId: null,
    coachId: session.valeur.acteur.id,
  })
  if (!page.ok) return reponseDepuisErreur(page.erreur, ctx.requestId)

  return reponseJson(
    {
      reservations: page.valeur.items.map((r) =>
        versReservationPublique(r as unknown as Record<string, unknown>),
      ),
      next_cursor: page.valeur.nextCursor,
    },
    200,
    ctx.requestId,
  )
}

export async function POST(req: NextRequest) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const coachId = session.valeur.acteur.id
  const limite = await checkRateLimit('reservations', {
    ipHash: ctx.ipHash,
    coachId,
  })
  if (!limite.allowed) {
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.rate_limited',
      meta: { request_id: ctx.requestId, dimension: limite.dimension },
    })
    return reponse429(limite, ctx.requestId)
  }

  const cle = lireCleIdempotence(req)
  if (!cle) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key (UUID v4) requis.')
  }

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.CreateReservationBody, corps.json, ctx.requestId)
  if (!body.ok) {
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.invalide',
      meta: { request_id: ctx.requestId, issue_paths: body.problemes.map((p) => p.path) },
    })
    return body.reponse
  }

  const hold = await creerHold(ctx, session.valeur.supabase, {
    clubId: body.data.club_id,
    spaceId: body.data.space_id,
    startsAt: body.data.starts_at,
    idempotencyKey: cle,
  })
  if (!hold.ok) {
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.refus',
      clubId: body.data.club_id,
      meta: { request_id: ctx.requestId, code: hold.erreur.code },
    })
    return reponseDepuisErreur(hold.erreur, ctx.requestId)
  }

  const resa = versReservationPublique(hold.valeur as Record<string, unknown>)
  auditOk({
    actorId: coachId,
    role: 'coach',
    action: 'reservation.hold.cree',
    clubId: body.data.club_id,
    targetType: 'reservation',
    targetId: resa.id,
    meta: { request_id: ctx.requestId },
  })

  return reponseJson(resa, 201, ctx.requestId)
}
