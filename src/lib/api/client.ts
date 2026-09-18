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

function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
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
  return crypto.randomUUID();
}

export async function listClubs(): Promise<ClubSummary[]> {
  const res = await apiFetch(`${apiBase()}/clubs`, {
    next: { revalidate: 60 },
  } as RequestInit);
  const data = await parseJson<{ clubs: ClubSummary[] }>(res);
  return data.clubs;
}

export async function getClub(clubId: string): Promise<ClubDetail> {
  const res = await apiFetch(`${apiBase()}/clubs/${encodeURIComponent(clubId)}`, {
    next: { revalidate: 60 },
  } as RequestInit);
  return parseJson<ClubDetail>(res);
}

export async function listSlots(
  clubId: string,
  params: { from: string; to: string; space_id?: string },
): Promise<SlotGrid> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.space_id) q.set('space_id', params.space_id);

  const res = await apiFetch(
    `${apiBase()}/clubs/${encodeURIComponent(clubId)}/slots?${q}`,
  );
  return parseJson<SlotGrid>(res);
}

export async function createReservation(
  body: CreateReservation,
  idempotencyKey = newIdempotencyKey(),
): Promise<Reservation> {
  const res = await apiFetch(`${apiBase()}/reservations`, {
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
  const res = await apiFetch(`${apiBase()}/reservations/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  return parseJson<Reservation>(res);
}

export async function listMyReservations(): Promise<Reservation[]> {
  const res = await apiFetch(`${apiBase()}/reservations`, {
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
  const res = await apiFetch(
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
  const res = await apiFetch(
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
  const res = await apiFetch(`${apiBase()}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 204) return;
  await parseJson(res);
}

export function formatCents(amountCents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountCents / 100);
}
