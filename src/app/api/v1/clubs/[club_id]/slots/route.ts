import { isClubId } from '@/lib/clubs';
import type { ClubId } from '@/lib/api/types';
import { buildMockSlotGrid } from '@/lib/mock/slots';
import { jsonError, jsonOk } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ club_id: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/v1/clubs/:id/slots — fake contrat-compatible (DoD Brad semaine 0). */
export async function GET(req: Request, { params }: Ctx) {
  const rawId = (await params).club_id;
  if (!isClubId(rawId)) {
    return jsonError(404, 'NOT_FOUND', 'Club introuvable.');
  }

  const clubId: ClubId = rawId;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const spaceId = url.searchParams.get('space_id') ?? undefined;

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return jsonError(400, 'VALIDATION_ERROR', 'Paramètres from/to requis (YYYY-MM-DD).', {
      from,
      to,
    });
  }
  if (from > to) {
    return jsonError(400, 'VALIDATION_ERROR', 'from doit être ≤ to.');
  }

  const grid = buildMockSlotGrid(clubId, from, to, spaceId);
  if (!grid) {
    return jsonError(404, 'NOT_FOUND', 'Club ou espace introuvable.');
  }

  return jsonOk(grid);
}
