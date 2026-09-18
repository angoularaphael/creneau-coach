import { NextRequest } from 'next/server';
import { isAuthMockEnabled } from '@/lib/auth/config';
import { validatePassword } from '@/lib/auth/password';
import {
  createMockUser,
  findByEmail,
  mockUserToMe,
  setMockSession,
} from '@/lib/auth/mock-store';
import { jsonError, jsonOk } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

/**
 * Uniquement COACH_AUTH_MOCK=1 — crée / ouvre une session cookie httpOnly.
 * Remplacé par Supabase Auth en prod.
 */
export async function POST(req: NextRequest) {
  if (!isAuthMockEnabled()) {
    return jsonError(404, 'NOT_FOUND', 'Introuvable.');
  }

  let body: {
    action?: string;
    email?: string;
    password?: string;
    first_name?: string;
    last_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  if (!email || !password) {
    return jsonError(400, 'VALIDATION_ERROR', 'E-mail et mot de passe requis.');
  }

  if (body.action === 'signup') {
    const pwdErr = validatePassword(password);
    if (pwdErr) return jsonError(400, 'VALIDATION_ERROR', pwdErr);
    if (findByEmail(email)) {
      return jsonError(409, 'CONFLICT', 'Compte déjà existant.');
    }
    const user = createMockUser({
      email,
      password,
      first_name: String(body.first_name || 'Coach'),
      last_name: String(body.last_name || 'Test'),
    });
    setMockSession(user.id);
    return jsonOk(mockUserToMe(user), { status: 201 });
  }

  const user = findByEmail(email);
  if (!user || user.password !== password) {
    return jsonError(401, 'UNAUTHENTICATED', 'Identifiants incorrects.');
  }
  setMockSession(user.id);
  return jsonOk(mockUserToMe(user));
}
