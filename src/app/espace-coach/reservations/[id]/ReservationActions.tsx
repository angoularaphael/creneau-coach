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
import { libellePaiement, libelleStatut } from '@/lib/libelles-coach';

function jour(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full' }).format(new Date(iso));
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
        setError('Le lien de paiement reçu n’est pas celui du prestataire : paiement bloqué par sécurité. Réessayez.');
        return;
      }
      router.push(`/espace-coach/reservations/${reservation.id}/signature`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Le paiement n’a pas pu démarrer. Vérifiez votre connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const question =
      reservation.status === 'held'
        ? 'Libérer ce créneau ? La place redevient disponible pour les autres coachs.'
        : 'Annuler cette réservation ? Plus de 24 h avant la séance, le montant vous revient en avoir.';
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      await cancelReservation(reservation.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'L’annulation n’a pas abouti. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );

  return (
    <div className="auth-form reservation-actions">
      <p className="reservation-actions__prix">
        <strong>{formatCents(reservation.amount_cents)}</strong>{' '}
        <span className="muted">— prix fixé au moment de la réservation</span>
      </p>
      <p className="muted">
        {jour(reservation.starts_at)}, de {heure(reservation.starts_at)} à {heure(reservation.ends_at)}
      </p>
      <p className="muted">
        {libelleStatut(reservation.status)}
        {reservation.status !== 'held' ? ` · ${libellePaiement(reservation.payment_status)}` : ''}
      </p>
      {reservation.hold_expires_at && reservation.status === 'held' ? (
        <p className="note">
          Votre place est gardée jusqu’à {heure(reservation.hold_expires_at)}. Passé ce délai,
          elle est libérée pour les autres coachs.
        </p>
      ) : null}

      <div role="alert" aria-live="assertive">
        {error ? <p className="form-error">{error}</p> : null}
      </div>

      {reservation.status === 'held' ? (
        <div className="reservation-actions__boutons">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => pay('payplug')}
          >
            Payer par carte{paiementsTest ? ' (mode test)' : ''}
          </button>
          {/* PayPal n'est pas branché sur ce parcours : la route de paiement le
              refuse. Un bouton qui mène à « pas encore branché » n'a rien à
              faire devant un coach — il reviendra quand le paiement existera. */}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => pay('credit')}
          >
            Payer avec un avoir
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={cancel}
          >
            Libérer ce créneau
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
        <div className="reservation-actions__boutons">
          <a
            className="btn btn-primary"
            href={`/espace-coach/reservations/${reservation.id}/qr`}
          >
            Afficher mon QR d’accès
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={cancel}
          >
            Annuler — avoir si plus de 24 h avant
          </button>
        </div>
      ) : null}

      {reservation.signature_status === 'signed' ? (
        <p className="reservation-actions__attestation">
          <a href={`/documents/attestation/${reservation.id}`} target="_blank" rel="noopener">
            Mon attestation de signature (PDF)
          </a>
        </p>
      ) : null}
    </div>
  );
}
