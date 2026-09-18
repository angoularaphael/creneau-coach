import { listerClubsPublic } from '@/lib/dal/clubs'
import { contexteRequete } from '@/lib/security'
import { reponseDepuisErreur, reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ctx = contexteRequete(req)
  const clubs = await listerClubsPublic()
  if (!clubs.ok) return reponseDepuisErreur(clubs.erreur, ctx.requestId)
  return reponseJson({ clubs: clubs.valeur }, 200, ctx.requestId)
}
