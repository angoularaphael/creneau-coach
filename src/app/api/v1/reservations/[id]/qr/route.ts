import type { ClubId } from '@/lib/api/types'
import { lireQrPourMoi } from '@/lib/dal/reservations'
import { exigerSession } from '@/lib/dal/acteur'
import { lireUrlAccesBadge } from '@/lib/bot/acces-badge'
import { pngDepuisUrl } from '@/lib/qr-access'
import { decisionAffichageQr } from '@/domain/qr-fenetre'
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

  const accessUrl = await lireUrlAccesBadge(id).catch(() => null)
  const affichage = decisionAffichageQr(
    Date.now(),
    secret.valeur.qr_valid_from,
    secret.valeur.qr_valid_to,
    accessUrl,
  )

  if (affichage === 'refus') {
    return reponseErreur('CONFLICT', {}, 'QR indisponible.', ctx.requestId)
  }

  if (affichage === 'preparation' || !accessUrl) {
    return reponseJson(
      {
        png_data_url: null,
        valid_from: secret.valeur.qr_valid_from,
        valid_to: secret.valeur.qr_valid_to,
        club_id: secret.valeur.club_id as ClubId,
        state: 'preparing',
        message: 'Accès en préparation',
      },
      200,
      ctx.requestId,
    )
  }

  let png: string
  try {
    png = await pngDepuisUrl(accessUrl)
  } catch {
    return reponseErreur('CONFLICT', {}, 'QR indisponible.', ctx.requestId)
  }

  return reponseJson(
    {
      png_data_url: png,
      valid_from: secret.valeur.qr_valid_from,
      valid_to: secret.valeur.qr_valid_to,
      club_id: secret.valeur.club_id as ClubId,
      state: 'active',
    },
    200,
    ctx.requestId,
  )
}
