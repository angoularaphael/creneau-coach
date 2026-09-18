import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import type { AccountStatus, Me, Profile, ProfilePatch } from '@/lib/api/types';

export const MOCK_COOKIE = 'coach_mock_session';

type MockUser = {
  id: string;
  email: string;
  password: string;
  email_verified: boolean;
  status: AccountStatus;
  consent_cgu_at: string;
  consent_privacy_at: string;
  profile: Profile;
  credits_cents: number;
};

/** Process memory — démo locale uniquement (Eddy = vraie table coach_profiles). */
const g = globalThis as unknown as { __coachMockUsers?: Map<string, MockUser> };
if (!g.__coachMockUsers) g.__coachMockUsers = new Map();
const users = g.__coachMockUsers;

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function findByEmail(email: string): MockUser | undefined {
  const key = email.trim().toLowerCase();
  for (const u of users.values()) {
    if (u.email === key) return u;
  }
  return undefined;
}

export function getMockUserById(id: string): MockUser | undefined {
  return users.get(id);
}

export function createMockUser(input: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}): MockUser {
  const id = randomUUID();
  const now = new Date().toISOString();
  const user: MockUser = {
    id,
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_verified: true, // mock : email « vérifié » pour UX locale
    status: 'active',
    consent_cgu_at: now,
    consent_privacy_at: now,
    profile: {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email.trim().toLowerCase(),
    },
    credits_cents: 0,
  };
  users.set(id, user);
  return user;
}

export function setMockSession(userId: string) {
  cookies().set(MOCK_COOKIE, userId, cookieOpts());
}

export function clearMockSession() {
  cookies().set(MOCK_COOKIE, '', { ...cookieOpts(), maxAge: 0 });
}

export function readMockSessionId(): string | null {
  return cookies().get(MOCK_COOKIE)?.value ?? null;
}

export function mockUserToMe(user: MockUser): Me {
  return {
    id: user.id,
    role: 'coach',
    status: user.status,
    profile: { ...user.profile, email: user.email },
    active_reservations_count: 0,
    max_active_reservations: 3,
    credits_cents: user.credits_cents,
    email_verified: user.email_verified,
  };
}

export function patchMockProfile(user: MockUser, patch: ProfilePatch): Me {
  const allowed: (keyof ProfilePatch)[] = [
    'first_name',
    'last_name',
    'birth_date',
    'phone',
    'address_line',
    'postal_code',
    'city',
    'diploma',
    'disciplines',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      (user.profile as Record<string, unknown>)[key] = patch[key];
    }
  }
  users.set(user.id, user);
  return mockUserToMe(user);
}

/** Dev helper: ?suspend=1 via admin later — for tests set status directly */
export function setMockStatus(userId: string, status: AccountStatus) {
  const u = users.get(userId);
  if (!u) return;
  u.status = status;
  users.set(userId, u);
}
