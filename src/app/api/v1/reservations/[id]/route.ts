// Next 16 : `params` est une Promise, la compatibilite synchrone a ete retiree.
// https://nextjs.org/docs/app/guides/upgrading/version-16
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { getReservationForCoach } from '@/lib/mock/reservations';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  const { id } = await params;
  const reservation = getReservationForCoach(id, me.id);
  if (!reservation) {
    return jsonError(404, 'NOT_FOUND', 'Réservation introuvable.');
  }
  return jsonOk(reservation);
}
