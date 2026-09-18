import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { authMode } from '@/lib/auth/config';
import {
  getMockUserById,
  patchMockProfile,
  readMockSessionId,
} from '@/lib/auth/mock-store';
import type { ProfilePatch } from '@/lib/api/types';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me */
export async function GET() {
  const me = await getSessionMe();
  if (!me) {
    return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  }
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.', {
      status: me.status,
    });
  }
  return jsonOk(me);
}

/** PATCH /api/v1/me */
export async function PATCH(req: NextRequest) {
  const me = await getSessionMe();
  if (!me) {
    return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  }
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }

  let body: ProfilePatch;
  try {
    body = (await req.json()) as ProfilePatch;
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  const mode = authMode();

  if (mode === 'mock') {
    const id = readMockSessionId();
    const user = id ? getMockUserById(id) : undefined;
    if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
    return jsonOk(patchMockProfile(user, body));
  }

  if (mode === 'supabase') {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

    const nextMeta = {
      ...user.user_metadata,
      ...body,
    };
    const { error } = await supabase.auth.updateUser({ data: nextMeta });
    if (error) {
      return jsonError(400, 'VALIDATION_ERROR', error.message);
    }

    const updated = await getSessionMe();
    return jsonOk(updated);
  }

  return jsonError(401, 'UNAUTHENTICATED', 'Auth non configurée.');
}

/** DELETE /api/v1/me — demande d’effacement RGPD */
export async function DELETE() {
  const me = await getSessionMe();
  if (!me) {
    return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  }
  // Junior / direction traiteront ; UI confirme la prise en compte
  return new Response(null, { status: 202 });
}
