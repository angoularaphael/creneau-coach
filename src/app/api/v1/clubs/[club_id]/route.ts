import { getClub, isClubId } from '@/lib/clubs';
import { jsonError, jsonOk } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: { club_id: string } };

/** GET /api/v1/clubs/:id — mock semaine 0. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!isClubId(params.club_id)) {
    return jsonError(404, 'NOT_FOUND', 'Club introuvable.');
  }
  const club = getClub(params.club_id);
  if (!club) {
    return jsonError(404, 'NOT_FOUND', 'Club introuvable.');
  }
  return jsonOk(club);
}
