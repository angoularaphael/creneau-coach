// Next 16 : `params` est une Promise, la compatibilite synchrone a ete retiree.
// https://nextjs.org/docs/app/guides/upgrading/version-16
import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { cancelReservation } from '@/lib/mock/reservations';
import { ApiError } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const params = await ctx.params;
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
    const { id } = await params;
    const reservation = cancelReservation(me.id, id, key);
    return jsonOk(reservation);
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
