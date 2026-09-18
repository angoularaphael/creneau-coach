import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { getMockUserById, readMockSessionId } from '@/lib/auth/mock-store';
import { authMode } from '@/lib/auth/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 5 * 1024 * 1024;

/** POST /api/v1/me/photo — MIME + 5 Mo, pas d’URL publique. */
export async function POST(req: NextRequest) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) {
    return jsonError(400, 'VALIDATION_ERROR', 'Fichier file requis.');
  }
  if (!ALLOWED.has(file.type)) {
    return jsonError(400, 'VALIDATION_ERROR', 'MIME autorisés : jpeg, png, webp.');
  }
  if (file.size > MAX) {
    return jsonError(400, 'VALIDATION_ERROR', 'Fichier max 5 Mo.');
  }

  const photo_path = `coach-private/${me.id}/${Date.now()}.${file.type.split('/')[1]}`;

  if (authMode() === 'mock') {
    const id = readMockSessionId();
    const user = id ? getMockUserById(id) : undefined;
    if (user) {
      user.profile.photo_path = photo_path;
    }
  } else if (authMode() === 'supabase') {
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { photo_path },
    });
  }

  return jsonOk({ photo_path });
}
