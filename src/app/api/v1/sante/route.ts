import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Sonde : aucune donnée métier, aucun réglage, aucun nom de lot. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
