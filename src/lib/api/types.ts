/** Types alignés sur docs/openapi.yaml — Lot B (Brad). Pas d’invention de champs. */

export type ClubId =
  | 'minimes'
  | 'st-cyprien'
  | 'etats-unis'
  | 'ramonville'
  | 'portet';

export type SlotState = 'open' | 'full' | 'blocked' | 'past';
export type Tariff = 'offpeak' | 'peak';
export type UserRole = 'coach' | 'manager_salle' | 'direction';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SUSPENDED'
  | 'NOT_FOUND'
  | 'SLOT_FULL'
  | 'SLOT_BLOCKED'
  | 'ACTIVE_LIMIT'
  | 'HOLD_EXPIRED'
  | 'PAYMENT_REQUIRED'
  | 'SIGNATURE_REQUIRED'
  | 'CANCEL_TOO_LATE'
  | 'PRICE_MISMATCH'
  | 'CONFLICT'
  | 'QR_WINDOW_CLOSED'
  | 'QR_WRONG_CLUB'
  | 'RATE_LIMITED'
  | 'WEBHOOK_INVALID';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Space {
  id: string;
  name: string;
  capacity?: number;
}

export interface ClubSummary {
  id: ClubId;
  name: string;
  city?: string;
  hero_image?: string;
  spaces: Space[];
}

export interface ClubDetail extends ClubSummary {
  description?: string;
  amenities?: string[];
  transport?: string;
  peak_hours?: string;
  offpeak_hours?: string;
}

export interface Slot {
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  tariff: Tariff;
  capacity: number;
  taken: number;
  state: SlotState;
  mine?: boolean;
}

export interface SlotGrid {
  club_id: ClubId;
  space_id?: string;
  slots: Slot[];
}

export interface Profile {
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  phone?: string;
  email?: string;
  address_line?: string;
  postal_code?: string;
  city?: string;
  diploma?: string;
  disciplines?: string[];
  photo_path?: string;
}

/** PATCH /me — pas status, pas tokens paiement, pas deciplus. */
export type ProfilePatch = {
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  phone?: string;
  address_line?: string;
  postal_code?: string;
  city?: string;
  diploma?: string;
  disciplines?: string[];
};

export interface Me {
  id: string;
  role: UserRole;
  club_id?: ClubId;
  status: AccountStatus;
  profile?: Profile;
  active_reservations_count?: number;
  max_active_reservations?: number;
  credits_cents?: number;
  email_verified?: boolean;
}

export type ReservationStatus =
  | 'held'
  | 'awaiting_signature'
  | 'confirmed'
  | 'consumed'
  | 'expired'
  | 'payment_failed'
  | 'cancelled_credit'
  | 'no_show';

export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'waived_credit';
export type SignatureStatus = 'none' | 'signed';
export type PaymentProvider = 'payplug' | 'paypal' | 'credit';

export interface Reservation {
  id: string;
  coach_id: string;
  club_id: ClubId;
  space_id: string;
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  currency?: string;
  status: ReservationStatus;
  payment_status: PaymentStatus;
  payment_provider?: PaymentProvider | null;
  signature_status: SignatureStatus;
  signed_at?: string | null;
  hold_expires_at?: string | null;
  qr_valid_from?: string | null;
  qr_valid_to?: string | null;
  qr_ready?: boolean;
  deciplus_job_status?: 'none' | 'queued' | 'granted' | 'revoked' | 'error';
  credit_id?: string | null;
  created_at?: string;
  checkout_url?: string | null;
}

export interface CreateReservation {
  club_id: ClubId;
  space_id: string;
  starts_at: string;
}

export interface CheckoutResponse {
  reservation_id: string;
  provider: PaymentProvider;
  checkout_url?: string;
  status: ReservationStatus;
}

export interface QrPayload {
  png_data_url: string;
  valid_from: string;
  valid_to: string;
  club_id: ClubId;
  state: 'waiting' | 'active' | 'expired' | 'revoked';
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}
