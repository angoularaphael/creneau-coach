import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import {
  buildMockQrPng,
  getReservationForCoach,
} from '@/lib/mock/reservations';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  const { id } = await params;
  const r = getReservationForCoach(id, me.id);
  if (!r) return jsonError(404, 'NOT_FOUND', 'Réservation introuvable.');

  if (r.status !== 'confirmed') {
    return jsonError(409, 'CONFLICT', 'QR disponible seulement si confirmed.', {
      status: r.status,
    });
  }

  const now = Date.now();
  const from = r.qr_valid_from ? new Date(r.qr_valid_from).getTime() : 0;
  const to = r.qr_valid_to ? new Date(r.qr_valid_to).getTime() : 0;
  let state: 'waiting' | 'active' | 'expired' = 'waiting';
  if (now >= from && now <= to) state = 'active';
  if (now > to) state = 'expired';

  return jsonOk({
    png_data_url: buildMockQrPng(r),
    valid_from: r.qr_valid_from,
    valid_to: r.qr_valid_to,
    club_id: r.club_id,
    state,
  });
}
