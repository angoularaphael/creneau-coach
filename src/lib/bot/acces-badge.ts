import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

/**
 * URL du badge Deciplus, colonne non grantée au coach.
 * À n'appeler qu'après `coach_qr_for_me` : la session a déjà prouvé
 * que la réservation est à lui. Le cron, lui, n'a pas de coach.
 */
export async function lireUrlAccesBadge(reservationId: string): Promise<string | null> {
  const sb = createServiceClient()
  const { data } = await sb
    .from('coach_deciplus_jobs')
    .select('access_url')
    .eq('reservation_id', reservationId)
    .eq('action', 'grant')
    .eq('status', 'granted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const url = String(data?.access_url || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  return url
}
