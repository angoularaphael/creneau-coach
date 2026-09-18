import { lireReservation } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { contexteRequete } from '@/lib/security'
import { reponseDepuisErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const { id } = await ctxRoute.params
  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)

  return reponseJson(
    versReservationPublique(lecture.valeur as unknown as Record<string, unknown>),
    200,
    ctx.requestId,
  )
}
