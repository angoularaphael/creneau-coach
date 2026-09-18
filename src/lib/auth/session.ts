import { authMode } from '@/lib/auth/config';
import {
  getMockUserById,
  mockUserToMe,
  readMockSessionId,
} from '@/lib/auth/mock-store';
import type { Me } from '@/lib/api/types';
import { createClient } from '@/lib/supabase/server';
import { countActiveForCoach } from '@/lib/mock/reservations';

/**
 * Session courante → Me (contrat GET /me).
 * Eddy branchera coach_profiles ; ici profil depuis user_metadata / mock.
 */
export async function getSessionMe(): Promise<Me | null> {
  const mode = authMode();

  if (mode === 'mock') {
    const id = readMockSessionId();
    if (!id) return null;
    const user = getMockUserById(id);
    if (!user) return null;
    const me = mockUserToMe(user);
    me.active_reservations_count = countActiveForCoach(user.id);
    return me;
  }

  if (mode === 'supabase') {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const meta = user.user_metadata ?? {};
    const status =
      meta.status === 'suspended' || meta.suspended_at
        ? 'suspended'
        : 'active';

    return {
      id: user.id,
      role: (meta.role as Me['role']) || 'coach',
      club_id: meta.club_id,
      status,
      profile: {
        first_name: meta.first_name,
        last_name: meta.last_name,
        phone: meta.phone,
        email: user.email,
        birth_date: meta.birth_date,
        address_line: meta.address_line,
        postal_code: meta.postal_code,
        city: meta.city,
        diploma: meta.diploma,
        disciplines: meta.disciplines,
        photo_path: meta.photo_path,
      },
      active_reservations_count: countActiveForCoach(user.id),
      max_active_reservations: 3,
      credits_cents: Number(meta.credits_cents ?? 0),
      email_verified: Boolean(user.email_confirmed_at),
    };
  }

  return null;
}
