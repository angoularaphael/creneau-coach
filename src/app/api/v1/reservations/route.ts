import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import {
  createHold,
  listReservationsForCoach,
} from '@/lib/mock/reservations';
import type { ClubId, CreateReservation } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import { isClubId } from '@/lib/clubs';

export const dynamic = 'force-dynamic';

function idempotencyKey(req: NextRequest): string | null {
  return req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
}

export async function GET() {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }
  return jsonOk({ reservations: listReservationsForCoach(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }

  const key = idempotencyKey(req);
  if (!key) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key requis.');
  }

  let body: CreateReservation;
  try {
    body = (await req.json()) as CreateReservation;
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  if (!body?.club_id || !body?.space_id || !body?.starts_at) {
    return jsonError(400, 'VALIDATION_ERROR', 'club_id, space_id, starts_at requis.');
  }
  if (!isClubId(body.club_id)) {
    return jsonError(404, 'NOT_FOUND', 'Club introuvable.');
  }

  try {
    const reservation = createHold(
      me.id,
      {
        club_id: body.club_id as ClubId,
        space_id: body.space_id,
        starts_at: body.starts_at,
      },
      key,
      me.status,
    );
    return jsonOk(reservation, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
