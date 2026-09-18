import { NextRequest } from 'next/server'

import {
  checkRateLimit,
  contexteRequete,
  lireCorps,
  schemas,
  valider,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseErreur } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = contexteRequete(req)
  const limite = await checkRateLimit('contact', { ipHash: ctx.ipHash })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.ContactBody, corps.json, ctx.requestId)
  if (!body.ok) return body.reponse

  console.info('[contact]', { len: body.data.message.length, requestId: ctx.requestId })
  return new Response(null, { status: 204, headers: { 'x-request-id': ctx.requestId } })
}
