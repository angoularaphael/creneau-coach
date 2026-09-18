import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/export — RGPD (sans token QR / id Deciplus). */
export async function GET() {
  const me = await getSessionMe();
  if (!me) {
    return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  }

  return jsonOk({
    exported_at: new Date().toISOString(),
    account: me,
    reservations: [],
    payments: [],
    note: 'Export mock Lot B — Eddy complétera résas / paiements sans secrets.',
  });
}
