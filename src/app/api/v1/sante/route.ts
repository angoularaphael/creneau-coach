import { NextResponse } from 'next/server'
import { CLUB_IDS, REGLAGES_DEFAUT } from '@/domain/contrat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sonde de santé du lot C. Elle ne révèle aucune donnée : ni compte, ni réservation,
 * ni variable d'environnement. Uniquement de quoi savoir que le socle répond.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'coach-reservation',
    lot: 'c',
    contrat: 'v1',
    clubs: CLUB_IDS.length,
    reglages_defaut: REGLAGES_DEFAUT,
  })
}
