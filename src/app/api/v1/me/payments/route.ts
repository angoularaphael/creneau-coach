import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { listPaymentsForCoach } from '@/lib/mock/reservations';

export const dynamic = 'force-dynamic';

/** Historique paiements (lecture) — Lot B UI. */
export async function GET() {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  return jsonOk({ payments: listPaymentsForCoach(me.id) });
}
