import { NextRequest } from 'next/server'

import { getSessionMe } from '@/lib/auth/session'
import { jsonError, jsonOk } from '@/lib/api/http'
import { majMonProfil } from '@/lib/dal/profil'
import { exigerSession } from '@/lib/dal/acteur'
import { contexteRequete, lireCorps, refusOrigine, schemas, valider } from '@/lib/security'
import { reponseDepuisErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getSessionMe()
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.')
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.', { status: me.status })
  }
  return jsonOk(me)
}

export async function PATCH(req: NextRequest) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse

  const json = corps.json
  const nettoye =
    json && typeof json === 'object' && !Array.isArray(json)
      ? Object.fromEntries(
          Object.entries(json as Record<string, unknown>).filter(([, v]) => {
            if (v === '' || v === null || v === undefined) return false
            if (Array.isArray(v) && v.length === 0) return false
            return true
          }),
        )
      : json

  const body = valider(schemas.ProfilePatchBody, nettoye, ctx.requestId)
  if (!body.ok) return body.reponse

  const maj = await majMonProfil(ctx, session.valeur.supabase, session.valeur.acteur, body.data)
  if (!maj.ok) return reponseDepuisErreur(maj.erreur, ctx.requestId)

  const me = await getSessionMe()
  return reponseJson(me, 200, ctx.requestId)
}

export async function DELETE(req: NextRequest) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const me = await getSessionMe()
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.')
  return new Response(null, { status: 202, headers: { 'x-request-id': ctx.requestId } })
}
