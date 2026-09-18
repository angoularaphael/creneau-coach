import 'server-only'

import type { ClubId, Reservation } from '@/lib/api/types'

/**
 * Projette une ligne SQL vers le contrat UI.
 * Jamais qr_jti, signature_pdf_path, payment_id, seat, idempotency_key.
 */
export function versReservationPublique(row: Record<string, unknown>): Reservation {
  const status = String(row.status ?? 'held') as Reservation['status']
  const payment = String(row.payment_status ?? 'unpaid') as Reservation['payment_status']
  const signature = String(row.signature_status ?? 'none') as Reservation['signature_status']
  const from = row.qr_valid_from ? String(row.qr_valid_from) : null
  return {
    id: String(row.id),
    coach_id: String(row.coach_id),
    club_id: String(row.club_id) as ClubId,
    space_id: String(row.space_id),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    amount_cents: Number(row.amount_cents),
    currency: row.currency ? String(row.currency) : 'eur',
    status,
    payment_status: payment,
    payment_provider: (row.payment_provider as Reservation['payment_provider']) ?? null,
    signature_status: signature,
    signed_at: row.signed_at ? String(row.signed_at) : null,
    hold_expires_at: row.hold_expires_at ? String(row.hold_expires_at) : null,
    qr_valid_from: from,
    qr_valid_to: row.qr_valid_to ? String(row.qr_valid_to) : null,
    qr_ready: status === 'confirmed' && Boolean(from),
    deciplus_job_status:
      (row.deciplus_job_status as Reservation['deciplus_job_status']) ?? 'none',
    credit_id: row.credit_id ? String(row.credit_id) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }
}
