import { NextRequest } from 'next/server'

import { jsonError } from '@/lib/api/http'
import { contexteRequete, refusOrigine } from '@/lib/security'

export const dynamic = 'force-dynamic'

/** Bucket privé pas encore servi. Ne pas écrire un chemin dans user_metadata. */
export async function POST(req: NextRequest) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  return jsonError(409, 'CONFLICT', 'Upload photo : bucket privé pas encore branché.')
}
