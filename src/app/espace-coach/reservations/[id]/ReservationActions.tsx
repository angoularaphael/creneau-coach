'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Reservation } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import {
  cancelReservation,
  checkoutReservation,
  formatCents,
} from '@/lib/api/client';
import { estUrlCheckoutSure } from '@/lib/paiement-url';

function when(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function ReservationActions({
  reservation,
  paiementsTest = false,
}: {
  reservation: Reservation
  paiementsTest?: boolean
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay(provider: 'payplug' | 'paypal' | 'credit') {
    setBusy(true);
    setError(null);
    try {
      const res = await checkoutReservation(reservation.id, provider);
      if (res.checkout_url && estUrlCheckoutSure(res.checkout_url)) {
        window.location.href = res.checkout_url;
        return;
      }
      if (res.checkout_url) {
        setError('URL de paiement refusée.');
        return;
      }
      router.push(`/espace-coach/reservations/${reservation.id}/signature`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Annuler cette réservation ?')) return;
    setBusy(true);
    setError(null);
    try {
      await cancelReservation(reservation.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Annulation impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form" style={{ marginTop: '1.5rem' }}>
      <p>
        <strong style={{ color: 'var(--ink)' }}>
          {formatCents(reservation.amount_cents)}
        </strong>{' '}
        <span className="muted">— montant serveur figé au hold</span>
      </p>
      <p className="muted">Début : {when(reservation.starts_at)}</p>
      <p className="muted">
        Statut : <code>{reservation.status}</code> · paiement{' '}
        <code>{reservation.payment_status}</code>
      </p>
      {reservation.hold_expires_at && reservation.status === 'held' ? (
        <p className="note">
          Hold expire à{' '}
          {new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            timeStyle: 'medium',
          }).format(new Date(reservation.hold_expires_at))}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {reservation.status === 'held' ? (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => pay('payplug')}
          >
            Payer (Payplug{paiementsTest ? ' TEST' : ''})
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => pay('paypal')}
          >
            Payer (PayPal)
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => pay('credit')}
          >
            Payer avec avoir
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={cancel}
          >
            Annuler le hold
          </button>
        </div>
      ) : null}

      {reservation.status === 'awaiting_signature' ? (
        <a
          className="btn btn-primary"
          href={`/espace-coach/reservations/${reservation.id}/signature`}
        >
          Signer les documents
        </a>
      ) : null}

      {reservation.status === 'confirmed' ? (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <a
            className="btn btn-primary"
            href={`/espace-coach/reservations/${reservation.id}/qr`}
          >
            Afficher le QR
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={cancel}
          >
            Annuler (+ avoir si &gt; 24 h)
          </button>
        </div>
      ) : null}
    </div>
  );
}
