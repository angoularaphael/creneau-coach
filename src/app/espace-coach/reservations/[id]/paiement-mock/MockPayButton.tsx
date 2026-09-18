'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api/types';

export function MockPayButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const provider = search.get('provider') || 'payplug';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/reservations/${reservationId}/payment/sync`,
        { method: 'POST', headers: { Accept: 'application/json' } },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(res.status, body ?? {
          error: { code: 'CONFLICT', message: 'Sync paiement échouée.' },
        });
      }
      router.push(`/espace-coach/reservations/${reservationId}/signature`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur paiement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <p className="note">
        Simulateur Brad (<code>{provider}</code>). Raphael remplacera par le
        vrai retour Prestataire + <code>POST …/payment/sync</code> re-query.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={confirm}
      >
        {busy ? 'Validation…' : 'Simuler paiement réussi'}
      </button>
    </div>
  );
}
