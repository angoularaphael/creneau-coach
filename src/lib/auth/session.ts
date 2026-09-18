import 'server-only'

import { REGLAGES_DEFAUT } from '@/domain/contrat'
import type { Me } from '@/lib/api/types'
import { authMode } from '@/lib/auth/config'
import {
  getMockUserById,
  mockUserToMe,
  readMockSessionId,
} from '@/lib/auth/mock-store'
import { compterActives } from '@/lib/dal/reservations'
import { lireMonProfil, soldeAvoirs } from '@/lib/dal/profil'
import { contextePage } from '@/lib/dal/page'
import { clientServeur } from '@/lib/supabase/serveur'
import { lireSession } from '@/lib/supabase/session'

/**
 * Session courante → Me. Statut, crédits et actives viennent de la base,
 * rôle de `app_metadata` (jamais `user_metadata`).
 */
export async function getSessionMe(): Promise<Me | null> {
  const mode = authMode()

  if (mode === 'mock') {
    const id = await readMockSessionId()
    if (!id) return null
    const user = getMockUserById(id)
    if (!user) return null
    return mockUserToMe(user)
  }

  if (mode !== 'supabase') return null

  const supabase = await clientServeur()
  const session = await lireSession(supabase)
  if (!session.connecte) return null

  const ctx = contextePage('/me')
  await supabase.rpc('coach_ensure_own_profile')

  const profil = await lireMonProfil(ctx, supabase, {
    ...session.acteur,
    statut: 'active',
    supprime: false,
  })
  if (!profil.ok) return null

  const [actives, credits] = await Promise.all([
    compterActives(ctx, supabase, session.acteur.id),
    soldeAvoirs(ctx, supabase, {
      ...session.acteur,
      statut: profil.valeur.status,
      supprime: profil.valeur.status === 'deleted',
    }),
  ])

  const p = profil.valeur
  const role = session.acteur.role === 'manager_salle' || session.acteur.role === 'direction'
    ? session.acteur.role
    : 'coach'

  return {
    id: session.acteur.id,
    role,
    club_id: session.acteur.clubId ?? undefined,
    status: p.status,
    profile: {
      first_name: p.first_name ?? undefined,
      last_name: p.last_name ?? undefined,
      birth_date: p.birth_date ?? undefined,
      phone: p.phone ?? undefined,
      email: p.email ?? session.acteur.email ?? undefined,
      address_line: p.address_line ?? undefined,
      postal_code: p.postal_code ?? undefined,
      city: p.city ?? undefined,
      diploma: p.diploma ?? undefined,
      disciplines: p.disciplines,
    },
    active_reservations_count: actives.ok ? actives.valeur : 0,
    max_active_reservations: REGLAGES_DEFAUT.max_active_reservations,
    credits_cents: credits.ok ? credits.valeur : 0,
    email_verified: true,
  }
}
