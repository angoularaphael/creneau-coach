import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { cancelReservation } from '@/lib/mock/reservations';
import { ApiError } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }

  const key =
    req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
  if (!key) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key requis.');
  }

  try {
    const reservation = cancelReservation(me.id, params.id, key);
    return jsonOk(reservation);
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
