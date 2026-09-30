import { NextRequest } from 'next/server'

import {
  checkRateLimit,
  contexteRequete,
  lireCorps,
  refusOrigine,
  schemas,
  valider,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseErreur } from '@/lib/http/erreurs'
import { envoyerContact } from '@/lib/mail/transactionnel'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const limite = await checkRateLimit('contact', { ipHash: ctx.ipHash })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.ContactBody, corps.json, ctx.requestId)
  if (!body.ok) return body.reponse

  const envoi = await envoyerContact({
    nom: body.data.name,
    email: body.data.email,
    message: body.data.message,
  })
  if (!envoi.ok) {
    console.error('[contact] e-mail non parti', { raison: envoi.raison, requestId: ctx.requestId })
    return reponseErreur(
      'CONFLICT',
      {},
      'Le message n’a pas pu partir. Réessayez dans un instant.',
      ctx.requestId,
    )
  }
  return new Response(null, { status: 204, headers: { 'x-request-id': ctx.requestId } })
}
