import { randomUUID, createHash } from 'crypto';
import type {
  ClubId,
  CreateReservation,
  PaymentProvider,
  Reservation,
} from '@/lib/api/types';
import { getClub } from '@/lib/clubs';
import { buildMockSlotGrid } from '@/lib/mock/slots';
import { getMockUserById } from '@/lib/auth/mock-store';
import { ApiError } from '@/lib/api/types';

type Store = {
  reservations: Map<string, Reservation>;
  idempotency: Map<string, { reservationId: string; at: number }>;
  payments: Array<{
    id: string;
    coach_id: string;
    reservation_id: string;
    amount_cents: number;
    provider: PaymentProvider;
    status: string;
    created_at: string;
  }>;
};

const g = globalThis as unknown as { __coachMockResa?: Store };
if (!g.__coachMockResa) {
  g.__coachMockResa = {
    reservations: new Map(),
    idempotency: new Map(),
    payments: [],
  };
}
const store = g.__coachMockResa;

const ACTIVE = new Set(['held', 'awaiting_signature', 'confirmed']);
const HOLD_TTL_MS = 10 * 60 * 1000;
const CANCEL_MIN_MS = 24 * 60 * 60 * 1000;
const CAPACITY = 2;
const MAX_ACTIVE = 3;

function purgeExpired(now = Date.now()) {
  for (const [id, r] of store.reservations) {
    if (
      r.status === 'held' &&
      r.hold_expires_at &&
      new Date(r.hold_expires_at).getTime() < now
    ) {
      store.reservations.set(id, { ...r, status: 'expired' });
    }
  }
  for (const [key, entry] of store.idempotency) {
    if (now - entry.at > 24 * 60 * 60 * 1000) store.idempotency.delete(key);
  }
}

function endsAtFromStart(startsAt: string): string {
  const d = new Date(startsAt);
  d.setHours(d.getHours() + 1);
  // Prefer ISO with same offset if present
  const m = startsAt.match(/([+-]\d{2}:\d{2})$/);
  if (m) {
    const iso = d.toISOString();
    // rebuild with offset from start — simpler: add 1h on the string hour
    const replaced = startsAt.replace(
      /T(\d{2}):/,
      (_, hh) => `T${String((Number(hh) + 1) % 24).padStart(2, '0')}:`,
    );
    // if hour was 18 → 19 ok; if crossing day rare for our grid
    if (Number(startsAt.slice(11, 13)) < 19) return replaced;
  }
  return new Date(new Date(startsAt).getTime() + 3600000).toISOString();
}

function amountForSlot(
  clubId: ClubId,
  spaceId: string,
  startsAt: string,
): number | null {
  const day = startsAt.slice(0, 10);
  const grid = buildMockSlotGrid(clubId, day, day, spaceId);
  const slot = grid?.slots.find((s) => s.starts_at === startsAt);
  return slot ? slot.amount_cents : null;
}

function slotState(
  clubId: ClubId,
  spaceId: string,
  startsAt: string,
): string | null {
  const day = startsAt.slice(0, 10);
  const grid = buildMockSlotGrid(clubId, day, day, spaceId);
  return grid?.slots.find((s) => s.starts_at === startsAt)?.state ?? null;
}

function takenCount(clubId: ClubId, spaceId: string, startsAt: string): number {
  let n = 0;
  for (const r of store.reservations.values()) {
    if (
      r.club_id === clubId &&
      r.space_id === spaceId &&
      r.starts_at === startsAt &&
      ACTIVE.has(r.status)
    ) {
      n += 1;
    }
  }
  return n;
}

function activeCount(coachId: string): number {
  let n = 0;
  for (const r of store.reservations.values()) {
    if (r.coach_id === coachId && ACTIVE.has(r.status)) n += 1;
  }
  return n;
}

export function listReservationsForCoach(coachId: string): Reservation[] {
  purgeExpired();
  return [...store.reservations.values()]
    .filter((r) => r.coach_id === coachId)
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
}

export function getReservation(id: string): Reservation | undefined {
  purgeExpired();
  return store.reservations.get(id);
}

/** Anti-IDOR : autre coach → undefined (404). */
export function getReservationForCoach(
  id: string,
  coachId: string,
): Reservation | undefined {
  const r = getReservation(id);
  if (!r || r.coach_id !== coachId) return undefined;
  return r;
}

export function createHold(
  coachId: string,
  body: CreateReservation,
  idempotencyKey: string,
  coachStatus: string,
): Reservation {
  purgeExpired();

  if (coachStatus === 'suspended') {
    throw new ApiError(403, {
      error: { code: 'SUSPENDED', message: 'Compte suspendu.' },
    });
  }

  const existing = store.idempotency.get(idempotencyKey);
  if (existing) {
    const r = store.reservations.get(existing.reservationId);
    if (r) return r;
  }

  const club = getClub(body.club_id);
  if (!club) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Club introuvable.' },
    });
  }
  if (!club.spaces.some((s) => s.id === body.space_id)) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Espace introuvable.' },
    });
  }

  const state = slotState(body.club_id, body.space_id, body.starts_at);
  if (!state) {
    throw new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Créneau invalide.' },
    });
  }
  if (state === 'past') {
    throw new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Créneau passé.' },
    });
  }
  if (state === 'blocked') {
    throw new ApiError(409, {
      error: { code: 'SLOT_BLOCKED', message: 'Créneau bloqué (éducative / BO).' },
    });
  }

  const amount = amountForSlot(body.club_id, body.space_id, body.starts_at);
  if (amount == null) {
    throw new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Tarif introuvable.' },
    });
  }

  if (activeCount(coachId) >= MAX_ACTIVE) {
    throw new ApiError(409, {
      error: {
        code: 'ACTIVE_LIMIT',
        message: 'Maximum 3 réservations actives.',
      },
    });
  }

  if (takenCount(body.club_id, body.space_id, body.starts_at) >= CAPACITY) {
    throw new ApiError(409, {
      error: { code: 'SLOT_FULL', message: 'Ce créneau est complet (2 coachs).' },
    });
  }

  // Un coach une résa active sur le même slot
  for (const r of store.reservations.values()) {
    if (
      r.coach_id === coachId &&
      r.space_id === body.space_id &&
      r.starts_at === body.starts_at &&
      ACTIVE.has(r.status)
    ) {
      throw new ApiError(409, {
        error: { code: 'CONFLICT', message: 'Vous avez déjà ce créneau.' },
      });
    }
  }

  const now = Date.now();
  const id = randomUUID();
  const reservation: Reservation = {
    id,
    coach_id: coachId,
    club_id: body.club_id,
    space_id: body.space_id,
    starts_at: body.starts_at,
    ends_at: endsAtFromStart(body.starts_at),
    amount_cents: amount,
    currency: 'eur',
    status: 'held',
    payment_status: 'unpaid',
    payment_provider: null,
    signature_status: 'none',
    hold_expires_at: new Date(now + HOLD_TTL_MS).toISOString(),
    qr_ready: false,
    deciplus_job_status: 'none',
    created_at: new Date(now).toISOString(),
  };

  store.reservations.set(id, reservation);
  store.idempotency.set(idempotencyKey, { reservationId: id, at: now });
  return reservation;
}

export function cancelReservation(
  coachId: string,
  id: string,
  idempotencyKey: string,
): Reservation {
  purgeExpired();
  const key = `cancel:${idempotencyKey}`;
  const cached = store.idempotency.get(key);
  if (cached) {
    const r = store.reservations.get(cached.reservationId);
    if (r) return r;
  }

  const r = getReservationForCoach(id, coachId);
  if (!r) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Réservation introuvable.' },
    });
  }

  if (r.status === 'held') {
    const next = { ...r, status: 'expired' as const, hold_expires_at: null };
    store.reservations.set(id, next);
    store.idempotency.set(key, { reservationId: id, at: Date.now() });
    return next;
  }

  if (r.status !== 'awaiting_signature' && r.status !== 'confirmed') {
    throw new ApiError(409, {
      error: { code: 'CONFLICT', message: 'Annulation impossible dans cet état.' },
    });
  }

  const msLeft = new Date(r.starts_at).getTime() - Date.now();
  if (msLeft < CANCEL_MIN_MS) {
    throw new ApiError(409, {
      error: {
        code: 'CANCEL_TOO_LATE',
        message: 'Annulation impossible moins de 24 h avant le créneau.',
      },
    });
  }

  const creditId = randomUUID();
  const user = getMockUserById(coachId);
  if (user) {
    user.credits_cents += r.amount_cents;
  }

  const next: Reservation = {
    ...r,
    status: 'cancelled_credit',
    credit_id: creditId,
    qr_ready: false,
  };
  store.reservations.set(id, next);
  store.idempotency.set(key, { reservationId: id, at: Date.now() });
  return next;
}

export function checkoutReservation(
  coachId: string,
  id: string,
  provider: PaymentProvider,
  idempotencyKey: string,
): { reservation: Reservation; checkout_url?: string } {
  purgeExpired();
  const key = `checkout:${idempotencyKey}`;
  const cached = store.idempotency.get(key);
  if (cached) {
    const r = store.reservations.get(cached.reservationId);
    if (r) {
      return {
        reservation: r,
        checkout_url: r.checkout_url || undefined,
      };
    }
  }

  const r = getReservationForCoach(id, coachId);
  if (!r) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Réservation introuvable.' },
    });
  }
  if (r.status !== 'held') {
    throw new ApiError(409, {
      error: { code: 'CONFLICT', message: 'Checkout seulement sur hold.' },
    });
  }
  if (r.hold_expires_at && new Date(r.hold_expires_at).getTime() < Date.now()) {
    store.reservations.set(id, { ...r, status: 'expired' });
    throw new ApiError(409, {
      error: { code: 'HOLD_EXPIRED', message: 'Hold expiré.' },
    });
  }

  if (provider === 'credit') {
    const user = getMockUserById(coachId);
    const balance = user?.credits_cents ?? 0;
    if (balance < r.amount_cents) {
      throw new ApiError(409, {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'Solde avoir insuffisant.',
          details: { credits_cents: balance, amount_cents: r.amount_cents },
        },
      });
    }
    if (user) user.credits_cents -= r.amount_cents;
    const next: Reservation = {
      ...r,
      status: 'awaiting_signature',
      payment_status: 'waived_credit',
      payment_provider: 'credit',
      hold_expires_at: null,
      checkout_url: null,
    };
    store.reservations.set(id, next);
    store.idempotency.set(key, { reservationId: id, at: Date.now() });
    store.payments.push({
      id: randomUUID(),
      coach_id: coachId,
      reservation_id: id,
      amount_cents: r.amount_cents,
      provider: 'credit',
      status: 'waived_credit',
      created_at: new Date().toISOString(),
    });
    return { reservation: next };
  }

  const site =
    (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
  const checkout_url = `${site}/espace-coach/reservations/${id}/paiement-mock?provider=${provider}`;
  const next: Reservation = {
    ...r,
    payment_provider: provider,
    checkout_url,
  };
  store.reservations.set(id, next);
  store.idempotency.set(key, { reservationId: id, at: Date.now() });
  return { reservation: next, checkout_url };
}

/** Mock retour prestataire — Brad UI démo jusqu’à Raphael. */
export function mockMarkPaid(coachId: string, id: string): Reservation {
  const r = getReservationForCoach(id, coachId);
  if (!r) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Réservation introuvable.' },
    });
  }
  if (r.status !== 'held' && r.status !== 'awaiting_signature') {
    throw new ApiError(409, {
      error: { code: 'CONFLICT', message: 'Paiement déjà traité ou hold mort.' },
    });
  }
  const next: Reservation = {
    ...r,
    status: 'awaiting_signature',
    payment_status: 'paid',
    hold_expires_at: null,
    checkout_url: null,
  };
  store.reservations.set(id, next);
  store.payments.push({
    id: randomUUID(),
    coach_id: coachId,
    reservation_id: id,
    amount_cents: r.amount_cents,
    provider: (r.payment_provider as PaymentProvider) || 'payplug',
    status: 'paid',
    created_at: new Date().toISOString(),
  });
  return next;
}

export function signReservation(
  coachId: string,
  id: string,
  consent: boolean,
): Reservation {
  const r = getReservationForCoach(id, coachId);
  if (!r) {
    throw new ApiError(404, {
      error: { code: 'NOT_FOUND', message: 'Réservation introuvable.' },
    });
  }
  if (!consent) {
    throw new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'consent: true requis.' },
    });
  }
  if (r.payment_status !== 'paid' && r.payment_status !== 'waived_credit') {
    throw new ApiError(409, {
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Paiement requis avant signature.',
      },
    });
  }
  if (r.status !== 'awaiting_signature') {
    throw new ApiError(409, {
      error: { code: 'CONFLICT', message: 'Signature non attendue.' },
    });
  }

  const validFrom = new Date(
    new Date(r.starts_at).getTime() - 5 * 60 * 1000,
  ).toISOString();
  const next: Reservation = {
    ...r,
    status: 'confirmed',
    signature_status: 'signed',
    signed_at: new Date().toISOString(),
    qr_valid_from: validFrom,
    qr_valid_to: r.ends_at,
    qr_ready: true,
    deciplus_job_status: 'queued',
  };
  store.reservations.set(id, next);
  return next;
}

export function buildMockQrPng(reservation: Reservation): string {
  // PNG 1x1 opaque via data URL — UI montre le contrat, Raphael livrera le vrai QR
  const label = createHash('sha256')
    .update(reservation.id + (process.env.QR_HMAC_SECRET || 'dev'))
    .digest('hex')
    .slice(0, 16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff"/><rect x="20" y="20" width="160" height="160" fill="#0c0d0f"/><text x="100" y="105" text-anchor="middle" fill="#e8193a" font-size="11" font-family="monospace">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function listPaymentsForCoach(coachId: string) {
  return store.payments
    .filter((p) => p.coach_id === coachId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function countActiveForCoach(coachId: string): number {
  purgeExpired();
  return activeCount(coachId);
}
