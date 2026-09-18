import { getSessionMe } from '@/lib/auth/session'
import { jsonError, jsonOk } from '@/lib/api/http'
import { listerReservations } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { contextePage } from '@/lib/dal/page'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionMe()
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.')

  const ctx = contextePage('/api/v1/me/payments')
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return jsonError(session.erreur.status as 401, session.erreur.code, session.erreur.message)

  const page = await listerReservations(ctx, session.valeur.supabase, { limit: 50 }, {
    clubId: null,
    coachId: session.valeur.acteur.id,
  })
  if (!page.ok) return jsonError(page.erreur.status as 409, page.erreur.code, page.erreur.message)

  const payments = page.valeur.items
    .map((r) => versReservationPublique(r as unknown as Record<string, unknown>))
    .filter((r) => r.payment_status === 'paid' || r.payment_status === 'waived_credit')
    .map((r) => ({
      id: r.id,
      coach_id: r.coach_id,
      reservation_id: r.id,
      amount_cents: r.amount_cents,
      provider: r.payment_provider,
      status: r.payment_status,
      created_at: r.created_at,
    }))

  return jsonOk({ payments })
}
