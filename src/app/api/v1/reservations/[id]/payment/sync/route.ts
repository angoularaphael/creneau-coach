import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { mockMarkPaid } from '@/lib/mock/reservations';
import { ApiError } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Démo Brad : simule le retour Payplug/PayPal (Raphael remplacera). */
export async function POST(_req: Request, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  try {
    const reservation = mockMarkPaid(me.id, params.id);
    return jsonOk(reservation);
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
