import { jsonError } from '@/lib/api/http'

export const dynamic = 'force-dynamic'

/** Le paiement ne se marque jamais depuis le navigateur. Uniquement webhook prestataire. */
export async function POST() {
  return jsonError(404, 'NOT_FOUND', 'Introuvable.')
}
