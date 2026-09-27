import { actionBotPourReservation } from '@/domain/qr-fenetre'
import { envoyerJobDeciplus, reservationVersJob } from '@/lib/bot/forward'
import { comparaisonConstante } from '@/lib/security/crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ligne = {
  id: string
  coach_id: string
  club_id: string
  space_id: string
  starts_at: string
  ends_at: string
  qr_valid_from: string | null
  qr_valid_to: string | null
  status: string
  deciplus_job_status: string | null
}

function cronAutorise(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret || secret.startsWith('change-me')) return false
  const header = String(req.headers.get('authorization') || '')
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  return comparaisonConstante(token, secret)
}

async function dejaDemande(
  sb: ReturnType<typeof createServiceClient>,
  reservationId: string,
  action: 'grant' | 'revoke',
): Promise<boolean> {
  const statuts = action === 'grant' ? ['queued', 'granted'] : ['queued', 'revoked']
  const { data } = await sb
    .from('coach_deciplus_jobs')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('action', action)
    .in('status', statuts)
    .limit(1)
  return Boolean(data && data.length > 0)
}

async function traiter() {
  const sb = createServiceClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const { data: aVendre } = await sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, ends_at, qr_valid_from, qr_valid_to, status, deciplus_job_status',
    )
    .eq('status', 'confirmed')
    .lte('qr_valid_from', nowIso)
    .gt('qr_valid_to', nowIso)
    .in('deciplus_job_status', ['none', 'queued', 'error'])
    .limit(20)

  const { data: aCouper } = await sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, ends_at, qr_valid_from, qr_valid_to, status, deciplus_job_status',
    )
    .eq('status', 'confirmed')
    .eq('deciplus_job_status', 'granted')
    .lte('qr_valid_to', nowIso)
    .limit(20)

  let grants = 0
  let revokes = 0

  for (const row of (aVendre || []) as Ligne[]) {
    if (actionBotPourReservation(now, row) !== 'grant') continue
    if (await dejaDemande(sb, row.id, 'grant')) continue
    await envoyerJobDeciplus(reservationVersJob(row as unknown as Record<string, unknown>, 'coach_grant'))
    grants += 1
  }

  for (const row of (aCouper || []) as Ligne[]) {
    if (actionBotPourReservation(now, row) !== 'revoke') continue
    if (await dejaDemande(sb, row.id, 'revoke')) continue
    await envoyerJobDeciplus(reservationVersJob(row as unknown as Record<string, unknown>, 'coach_revoke'))
    revokes += 1
  }

  return { grants, revokes }
}

async function reponse(req: Request) {
  if (!cronAutorise(req)) {
    return reponseJson({ ok: false }, 401)
  }
  const bilan = await traiter()
  return reponseJson({ ok: true, ...bilan }, 200)
}

export function GET(req: Request) {
  return reponse(req)
}

export function POST(req: Request) {
  return reponse(req)
}
