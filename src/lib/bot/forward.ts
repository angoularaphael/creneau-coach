import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

function botUrl(): string {
  return String(process.env.COACH_BOT_URL || 'http://prem-eu4.bot-hosting.net:20695').replace(/\/$/, '')
}

function secret(): string {
  return String(process.env.SYNC_SECRET || '').trim()
}

export type JobDeciplus = {
  readonly action: 'coach_grant' | 'coach_revoke'
  readonly reservation: {
    readonly id: string
    readonly coach_id: string
    readonly club_id: string
    readonly space_id: string
    readonly starts_at: string
    readonly ends_at: string
    readonly qr_valid_from?: string | null
    readonly qr_valid_to?: string | null
  }
}

export function reservationVersJob(
  row: Record<string, unknown>,
  action: JobDeciplus['action'],
): JobDeciplus {
  return {
    action,
    reservation: {
      id: String(row.id),
      coach_id: String(row.coach_id),
      club_id: String(row.club_id),
      space_id: String(row.space_id),
      starts_at: String(row.starts_at),
      ends_at: String(row.ends_at),
      qr_valid_from: row.qr_valid_from ? String(row.qr_valid_from) : null,
      qr_valid_to: row.qr_valid_to ? String(row.qr_valid_to) : null,
    },
  }
}

export function doitRevoquerDeciplus(statut: string | null | undefined): boolean {
  return statut === 'granted' || statut === 'queued' || statut === 'error'
}

/**
 * File Deciplus : ligne `coach_deciplus_jobs` + POST bot (x-sync-secret).
 *
 * Échec HTTP : on journalise, on ne fait pas échouer la signature / l’annulation
 * du coach. Le statut `queued` reste, le worker BotHosting reprend.
 */
export async function envoyerJobDeciplus(job: JobDeciplus): Promise<void> {
  const sb = createServiceClient()
  const { data: profil } = await sb
    .from('coach_profiles')
    .select(
      'first_name, last_name, email, phone, birth_date, address_line, postal_code, city, deciplus_member_id',
    )
    .eq('id', job.reservation.coach_id)
    .maybeSingle()

  const actionSql = job.action === 'coach_grant' ? 'grant' : 'revoke'
  await sb.from('coach_deciplus_jobs').insert({
    reservation_id: job.reservation.id,
    coach_id: job.reservation.coach_id,
    action: actionSql,
    status: 'queued',
    deciplus_member_id: profil?.deciplus_member_id ? String(profil.deciplus_member_id) : null,
  })

  const url = `${botUrl()}/api/jobs`
  const sync = secret()
  if (!sync) {
    console.warn('[deciplus] SYNC_SECRET absent — job SQL posé, bot non appelé')
    return
  }

  const body = {
    action: job.action,
    order_id: job.reservation.id,
    reservation_id: job.reservation.id,
    club_id: job.reservation.club_id,
    gym: job.reservation.club_id,
    space_id: job.reservation.space_id,
    qr_valid_from: job.reservation.qr_valid_from,
    qr_valid_to: job.reservation.qr_valid_to,
    starts_at: job.reservation.starts_at,
    ends_at: job.reservation.ends_at,
    deciplus_member_id: profil?.deciplus_member_id || null,
    status_callback_base: String(process.env.SITE_URL || '').replace(/\/$/, ''),
    customer: {
      first_name: profil?.first_name,
      last_name: profil?.last_name,
      email: profil?.email,
      phone: profil?.phone,
      birth_date: profil?.birth_date,
      address: profil?.address_line,
      postal_code: profil?.postal_code,
      city: profil?.city,
    },
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': sync },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.warn('[deciplus] bot HTTP', { status: res.status })
    }
  } catch (e) {
    console.warn('[deciplus] bot injoignable', { error: e instanceof Error ? e.message : 'fetch' })
  }
}
