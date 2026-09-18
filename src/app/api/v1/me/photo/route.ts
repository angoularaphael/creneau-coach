import { jsonError } from '@/lib/api/http'

export const dynamic = 'force-dynamic'

/** Bucket privé pas encore servi. Ne pas écrire un chemin dans user_metadata. */
export async function POST() {
  return jsonError(409, 'CONFLICT', 'Upload photo : bucket privé pas encore branché.')
}
