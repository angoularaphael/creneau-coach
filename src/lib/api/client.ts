import type {
  ApiErrorBody,
  ClubDetail,
  ClubSummary,
  CreateReservation,
  PaymentProvider,
  Reservation,
  SlotGrid,
} from './types';
import { ApiError } from './types';
import {
  getClub as getClubLocal,
  listClubs as listClubsLocal,
} from '@/lib/clubs';
import { buildMockSlotGrid } from '@/lib/mock/slots';
import type { ClubId } from './types';

function useHttp(): boolean {
  return process.env.COACH_API_HTTP === '1';
}

export function apiBase(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_INTERNAL_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '') + '/api/v1';
  }
  return '/api/v1';
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const errBody = (body ?? {
      error: {
        code: 'VALIDATION_ERROR',
        message: res.statusText || 'Erreur API',
      },
    }) as ApiErrorBody;
    throw new ApiError(res.status, errBody);
  }
  return body as T;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listClubs(): Promise<ClubSummary[]> {
  if (!useHttp() && typeof window === 'undefined') {
    return listClubsLocal();
  }
  const res = await fetch(`${apiBase()}/clubs`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  const data = await parseJson<{ clubs: ClubSummary[] }>(res);
  return data.clubs;
}

export async function getClub(clubId: string): Promise<ClubDetail> {
  if (!useHttp() && typeof window === 'undefined') {
    const club = getClubLocal(clubId);
    if (!club) {
      throw new ApiError(404, {
        error: { code: 'NOT_FOUND', message: 'Club introuvable.' },
      });
    }
    return club;
  }
  const res = await fetch(`${apiBase()}/clubs/${encodeURIComponent(clubId)}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  return parseJson<ClubDetail>(res);
}

export async function listSlots(
  clubId: string,
  params: { from: string; to: string; space_id?: string },
): Promise<SlotGrid> {
  if (!useHttp() && typeof window === 'undefined') {
    const grid = buildMockSlotGrid(
      clubId as ClubId,
      params.from,
      params.to,
      params.space_id,
    );
    if (!grid) {
      throw new ApiError(404, {
        error: { code: 'NOT_FOUND', message: 'Club ou espace introuvable.' },
      });
    }
    return grid;
  }

  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.space_id) q.set('space_id', params.space_id);

  const res = await fetch(
    `${apiBase()}/clubs/${encodeURIComponent(clubId)}/slots?${q}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );
  return parseJson<SlotGrid>(res);
}

export async function createReservation(
  body: CreateReservation,
  idempotencyKey = newIdempotencyKey(),
): Promise<Reservation> {
  const res = await fetch(`${apiBase()}/reservations`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  return parseJson<Reservation>(res);
}

export async function getReservation(id: string): Promise<Reservation> {
  const res = await fetch(`${apiBase()}/reservations/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return parseJson<Reservation>(res);
}

export async function listMyReservations(): Promise<Reservation[]> {
  const res = await fetch(`${apiBase()}/reservations`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await parseJson<{ reservations: Reservation[] }>(res);
  return data.reservations;
}

export async function checkoutReservation(
  id: string,
  provider: PaymentProvider,
  idempotencyKey = newIdempotencyKey(),
) {
  const res = await fetch(
    `${apiBase()}/reservations/${encodeURIComponent(id)}/checkout`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ provider }),
    },
  );
  return parseJson<{
    reservation_id: string;
    provider: PaymentProvider;
    checkout_url?: string;
    status: string;
  }>(res);
}

export async function cancelReservation(
  id: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<Reservation> {
  const res = await fetch(
    `${apiBase()}/reservations/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    },
  );
  return parseJson<Reservation>(res);
}

export async function postContact(input: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const res = await fetch(`${apiBase()}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 204) return;
  await parseJson(res);
}

/** Affiche amount_cents serveur — jamais recalculé. */
export function formatCents(amountCents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountCents / 100);
}
