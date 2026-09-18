'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ClubId, Slot } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import { createReservation, formatCents } from '@/lib/api/client';

const STATE_LABEL: Record<Slot['state'], string> = {
  open: 'Disponible',
  full: 'Complet',
  blocked: 'Bloqué',
  past: 'Passé',
};

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

type Props = {
  clubId: ClubId;
  spaceId: string;
  slots: Slot[];
  loggedIn: boolean;
};

export function SlotGrid({ clubId, spaceId, slots, loggedIn }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (slots.length === 0) {
    return <p className="muted">Aucun créneau sur cette période.</p>;
  }

  async function book(slot: Slot) {
    setError(null);
    if (!loggedIn) {
      router.push(
        `/auth/connexion?next=${encodeURIComponent(`/clubs/${clubId}`)}`,
      );
      return;
    }
    if (slot.state !== 'open') return;

    setBusy(slot.starts_at);
    try {
      const reservation = await createReservation({
        club_id: clubId,
        space_id: spaceId,
        starts_at: slot.starts_at,
      });
      router.push(`/espace-coach/reservations/${reservation.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Réservation impossible.');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error ? (
        <p className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      ) : null}
      <div className="slot-grid" role="list">
        {slots.map((slot) => {
          const canBook = slot.state === 'open';
          return (
            <article
              key={slot.starts_at}
              className="slot"
              data-state={slot.state}
              role="listitem"
            >
              <strong>{timeLabel(slot.starts_at)}</strong>
              <span className="price">{formatCents(slot.amount_cents)}</span>
              <span className="state">
                {STATE_LABEL[slot.state]} · {slot.taken}/{slot.capacity}
                {slot.mine ? ' · mon créneau' : ''}
              </span>
              {canBook ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '0.65rem', width: '100%' }}
                  disabled={busy === slot.starts_at}
                  onClick={() => book(slot)}
                >
                  {busy === slot.starts_at ? 'Hold…' : 'Réserver'}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
