import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { getReservationForCoach, signReservation } from '@/lib/mock/reservations';
import { ApiError } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  let body: { consent?: boolean; signature_image?: string; document_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  try {
    const { id } = await params;
    const reservation = signReservation(me.id, id, body.consent === true);
    return jsonOk(reservation);
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  const { id } = await params;
  const r = getReservationForCoach(id, me.id);
  if (!r) return jsonError(404, 'NOT_FOUND', 'Réservation introuvable.');
  return jsonOk({
    documents: [
      { id: '00000000-0000-4000-8000-000000000001', kind: 'cgv', title: 'CGV', version: '2026-09' },
      { id: '00000000-0000-4000-8000-000000000002', kind: 'reglement', title: 'Règlement intérieur', version: '2026-09' },
      { id: '00000000-0000-4000-8000-000000000003', kind: 'decharge', title: 'Décharge', version: '2026-09' },
    ],
  });
}
