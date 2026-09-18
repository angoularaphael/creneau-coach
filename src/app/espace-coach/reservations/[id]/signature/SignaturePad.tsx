'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/types';

export function SignaturePad({ reservationId }: { reservationId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setDrawing(true);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = '#0c0d0f';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function submit() {
    setError(null);
    if (!consent) {
      setError('Le consentement est obligatoire.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signature_image = canvas.toDataURL('image/png');

    setBusy(true);
    try {
      const docsRes = await fetch(`/api/v1/reservations/${reservationId}/signature`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const docsBody = await docsRes.json().catch(() => null);
      const document_ids = Array.isArray(docsBody?.documents)
        ? docsBody.documents.map((d: { id: string }) => d.id)
        : [];
      if (document_ids.length < 3) {
        throw new ApiError(409, {
          error: { code: 'CONFLICT', message: 'Documents contractuels indisponibles.' },
        });
      }

      const res = await fetch(`/api/v1/reservations/${reservationId}/signature`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          consent: true,
          signature_image,
          document_ids,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(res.status, body ?? {
          error: { code: 'CONFLICT', message: 'Signature refusée.' },
        });
      }
      router.push(`/espace-coach/reservations/${reservationId}/qr`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur signature.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <p className="muted">
        Pad de signature. Le PDF privé / hash SHA-256 est enregistré serveur.
        Passage <code>awaiting_signature → confirmed</code> ici.
      </p>
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        className="sign-pad"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>Je consens à signer CGV, RI et décharge (non pré-coché).</span>
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
        <button type="button" className="btn btn-ghost" onClick={clear}>
          Effacer
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={submit}
        >
          {busy ? 'Envoi…' : 'Signer et confirmer'}
        </button>
      </div>
    </div>
  );
}
