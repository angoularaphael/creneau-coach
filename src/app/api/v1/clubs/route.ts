import { listClubs } from '@/lib/clubs';
import { jsonOk } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/clubs — mock semaine 0 (Junior remplacera). */
export async function GET() {
  return jsonOk({ clubs: listClubs() });
}
