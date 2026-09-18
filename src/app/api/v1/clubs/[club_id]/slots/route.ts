import type { ClubId } from '@/lib/api/types'
import { isClubId } from '@/lib/clubs'
import { lireGrillePublic } from '@/lib/dal/clubs'
import { clientServeur } from '@/lib/supabase/serveur'
import { contexteRequete, schemas, valider } from '@/lib/security'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ club_id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const ctx = contexteRequete(req)
  const clubId = (await params).club_id
  if (!isClubId(clubId)) return reponseErreur('NOT_FOUND', {}, undefined, ctx.requestId)

  const url = new URL(req.url)
  const q = valider(
    schemas.SlotsQuery,
    {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      space_id: url.searchParams.get('space_id') ?? undefined,
    },
    ctx.requestId,
  )
  if (!q.ok) return q.reponse
  if (q.data.from > q.data.to) {
    return reponseErreur(
      'VALIDATION_ERROR',
      { issues: [{ path: 'from', code: 'order' }] },
      'from doit être ≤ to.',
      ctx.requestId,
    )
  }

  const grille = await lireGrillePublic({
    clubId,
    spaceId: q.data.space_id,
    from: q.data.from,
    to: q.data.to,
  })
  if (!grille.ok) return reponseDepuisErreur(grille.erreur, ctx.requestId)

  if (grille.valeur.slots.length === 0 && q.data.space_id) {
    return reponseErreur('NOT_FOUND', {}, undefined, ctx.requestId)
  }

  const mine = await creneauxDuCoach(clubId, q.data.from, q.data.to)
  return reponseJson(
    {
      ...grille.valeur,
      slots: grille.valeur.slots.map((s) => {
        const iso = new Date(s.starts_at).toISOString()
        return mine.has(iso) || mine.has(s.starts_at) ? { ...s, mine: true } : s
      }),
    },
    200,
    ctx.requestId,
  )
}

async function creneauxDuCoach(clubId: ClubId, from: string, to: string): Promise<Set<string>> {
  try {
    const sb = await clientServeur()
    const { data } = await sb.auth.getClaims()
    if (!data?.claims?.sub) return new Set()

    const { data: lignes } = await sb
      .from('coach_reservations')
      .select('starts_at')
      .eq('club_id', clubId)
      .gte('starts_at', from)
      .lte('starts_at', `${to}T23:59:59+02:00`)
      .in('status', ['held', 'awaiting_signature', 'confirmed'])

    const out = new Set<string>()
    for (const l of lignes ?? []) {
      const brut = String(l.starts_at)
      out.add(brut)
      out.add(new Date(brut).toISOString())
    }
    return out
  } catch {
    return new Set()
  }
}
