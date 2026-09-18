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

  const ctx = contextePage('/api/v1/me/export')
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return jsonError(session.erreur.status as 401, session.erreur.code, session.erreur.message)

  const page = await listerReservations(ctx, session.valeur.supabase, { limit: 100 }, {
    clubId: null,
    coachId: session.valeur.acteur.id,
  })
  const reservations = page.ok
    ? page.valeur.items.map((r) => versReservationPublique(r as unknown as Record<string, unknown>))
    : []

  return jsonOk({
    exported_at: new Date().toISOString(),
    account: me,
    reservations,
    payments: reservations
      .filter((r) => r.payment_status === 'paid' || r.payment_status === 'waived_credit')
      .map((r) => ({
        reservation_id: r.id,
        amount_cents: r.amount_cents,
        provider: r.payment_provider,
        status: r.payment_status,
      })),
  })
}
