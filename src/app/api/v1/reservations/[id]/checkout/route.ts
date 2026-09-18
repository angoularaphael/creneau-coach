import { NextRequest } from 'next/server';
import { getSessionMe } from '@/lib/auth/session';
import { jsonError, jsonOk } from '@/lib/api/http';
import { checkoutReservation } from '@/lib/mock/reservations';
import { ApiError, type PaymentProvider } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const PROVIDERS = new Set(['payplug', 'paypal', 'credit']);

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = await getSessionMe();
  if (!me) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');
  if (me.status === 'suspended') {
    return jsonError(403, 'SUSPENDED', 'Compte suspendu.');
  }

  const key =
    req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
  if (!key) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key requis.');
  }

  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  if (!body.provider || !PROVIDERS.has(body.provider)) {
    return jsonError(400, 'VALIDATION_ERROR', 'provider invalide.');
  }

  try {
    const { id } = await params;
    const result = checkoutReservation(
      me.id,
      id,
      body.provider as PaymentProvider,
      key,
    );
    return jsonOk({
      reservation_id: result.reservation.id,
      provider: body.provider,
      checkout_url: result.checkout_url,
      status: result.reservation.status,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}
