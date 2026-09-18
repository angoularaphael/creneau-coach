import type { ClubId } from '@/lib/api/types'
import { lireQrPourMoi } from '@/lib/dal/reservations'
import { exigerSession } from '@/lib/dal/acteur'
import { pngQr } from '@/lib/qr-access'
import { contexteRequete } from '@/lib/security'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const { id } = await ctxRoute.params
  const secret = await lireQrPourMoi(ctx, session.valeur.supabase, id)
  if (!secret.ok) return reponseDepuisErreur(secret.erreur, ctx.requestId)

  let png: string
  try {
    png = await pngQr(
      secret.valeur.qr_jti,
      secret.valeur.club_id,
      secret.valeur.qr_valid_from,
      secret.valeur.qr_valid_to,
    )
  } catch {
    return reponseErreur('CONFLICT', {}, 'QR indisponible.', ctx.requestId)
  }

  const now = Date.now()
  const from = new Date(secret.valeur.qr_valid_from).getTime()
  const to = new Date(secret.valeur.qr_valid_to).getTime()
  let state: 'waiting' | 'active' | 'expired' = 'waiting'
  if (now >= from && now <= to) state = 'active'
  if (now > to) state = 'expired'

  return reponseJson(
    {
      png_data_url: png,
      valid_from: secret.valeur.qr_valid_from,
      valid_to: secret.valeur.qr_valid_to,
      club_id: secret.valeur.club_id as ClubId,
      state,
    },
    200,
    ctx.requestId,
  )
}
