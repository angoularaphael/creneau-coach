import { isClubId } from '@/lib/clubs'
import { lireClubPublic } from '@/lib/dal/clubs'
import { contexteRequete } from '@/lib/security'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ club_id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const ctx = contexteRequete(req)
  const { club_id } = await params
  if (!isClubId(club_id)) return reponseErreur('NOT_FOUND', {}, undefined, ctx.requestId)

  const club = await lireClubPublic(club_id)
  if (!club.ok) return reponseDepuisErreur(club.erreur, ctx.requestId)
  return reponseJson(club.valeur, 200, ctx.requestId)
}
