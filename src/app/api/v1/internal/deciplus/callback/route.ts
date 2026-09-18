import { createServiceClient } from '@/lib/supabase/service'
import { contexteRequete } from '@/lib/security'
import { verifyInternalRequest, reponseRefusInterne } from '@/lib/security/internal-auth'
import { reponseJson } from '@/lib/http/erreurs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATUTS = new Set(['queued', 'granted', 'revoked', 'error'])

/**
 * Callback du robot Deciplus → app.
 *
 * Auth : `x-sync-secret` (même valeur que le bot). Corps brut, jamais reparsé
 * pour la signature (spec-04).
 */
export async function POST(req: Request) {
  const ctx = contexteRequete(req)
  const brut = await req.text()
  const auth = await verifyInternalRequest(req, brut)
  if (!auth.ok) return reponseRefusInterne(auth, ctx.requestId)

  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(brut || '{}') as Record<string, unknown>
  } catch {
    return reponseJson({ ok: false }, 400, ctx.requestId)
  }

  const reservationId = String(body.reservation_id || body.order_id || '').trim()
  const jobStatus = String(body.job_status || '').trim()
  if (!reservationId || !STATUTS.has(jobStatus)) {
    return reponseJson({ ok: false }, 400, ctx.requestId)
  }

  const memberId = body.deciplus_member_id ? String(body.deciplus_member_id).slice(0, 40) : null
  const errMsg = body.error ? String(body.error).slice(0, 400) : null
  const sb = createServiceClient()

  const { data: resa } = await sb
    .from('coach_reservations')
    .select('id, coach_id')
    .eq('id', reservationId)
    .maybeSingle()

  if (!resa) {
    return reponseJson({ ok: true, ignored: true }, 200, ctx.requestId)
  }

  await sb
    .from('coach_reservations')
    .update({ deciplus_job_status: jobStatus })
    .eq('id', reservationId)

  const { data: jobs } = await sb
    .from('coach_deciplus_jobs')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('status', 'queued')
    .order('created_at', { ascending: false })
    .limit(1)

  const jobId = jobs?.[0]?.id
  if (jobId) {
    await sb
      .from('coach_deciplus_jobs')
      .update({
        status: jobStatus,
        deciplus_member_id: memberId,
        error: errMsg,
      })
      .eq('id', jobId)
  }

  if (memberId && resa.coach_id) {
    await sb.from('coach_profiles').update({ deciplus_member_id: memberId }).eq('id', resa.coach_id)
  }

  return reponseJson({ ok: true }, 200, ctx.requestId)
}
