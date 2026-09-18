import { NextRequest } from 'next/server'

import { lireReservation, listerDocumentsCourants, marquerSigne } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { nouvelJti } from '@/lib/qr-access'
import {
  checkRateLimit,
  contexteRequete,
  lireCorps,
  schemas,
  valider,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const { id } = await ctxRoute.params
  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)

  const docs = await listerDocumentsCourants(ctx, session.valeur.supabase)
  if (!docs.ok) return reponseDepuisErreur(docs.erreur, ctx.requestId)

  return reponseJson({ documents: docs.valeur }, 200, ctx.requestId)
}

export async function POST(req: NextRequest, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const limite = await checkRateLimit('signature', {
    ipHash: ctx.ipHash,
    coachId: session.valeur.acteur.id,
  })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.SignatureBody, corps.json, ctx.requestId)
  if (!body.ok) return body.reponse

  const docs = await listerDocumentsCourants(ctx, session.valeur.supabase)
  if (!docs.ok) return reponseDepuisErreur(docs.erreur, ctx.requestId)
  const attendus = new Set(docs.valeur.map((d) => d.id))
  if (body.data.document_ids.length < 3 || !body.data.document_ids.every((id) => attendus.has(id))) {
    return reponseErreur(
      'VALIDATION_ERROR',
      { issues: [{ path: 'document_ids', code: 'mismatch' }] },
      'Les 3 documents courants sont obligatoires.',
      ctx.requestId,
    )
  }

  const { id } = await ctxRoute.params
  const signe = await marquerSigne(ctx, session.valeur.supabase, {
    reservationId: id,
    pdfPath: `signatures/${id}.pdf`,
    qrJti: nouvelJti(),
  })
  if (!signe.ok) return reponseDepuisErreur(signe.erreur, ctx.requestId)

  return reponseJson(
    versReservationPublique(signe.valeur as Record<string, unknown>),
    200,
    ctx.requestId,
  )
}
