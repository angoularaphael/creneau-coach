import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { getReservationForCoach } from '@/lib/mock/reservations';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  const reservation = getReservationForCoach(params.id, me.id);
  if (!reservation) {
    return jsonError(404, 'NOT_FOUND', 'Réservation introuvable.');
  }
  return jsonOk(reservation);
}
