'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/types';
import { enumererDocuments } from '@/lib/documents/noms';

type Doc = { readonly id: string; readonly kind: string; readonly title: string };
type Mode = 'trace' | 'saisie';

/**
 * Un tracé en dessous de cette longueur (en pixels du canevas) n'est pas une
 * signature : c'est un clic ou un point. Sans ce seuil, on archivait une case
 * vide en guise de preuve.
 */
const LONGUEUR_MIN_TRACE = 120;

/**
 * La signature, au doigt ou au clavier.
 *
 * ── AU DOIGT ─────────────────────────────────────────────────────────────
 * `touch-action: none` (CSS) et la capture du pointeur : sans eux, sur un
 * téléphone, tracer faisait DÉFILER la page au lieu de dessiner, et un tracé
 * qui sortait du cadre s'interrompait.
 *
 * ── AU CLAVIER ───────────────────────────────────────────────────────────
 * Un tracé est un geste « de chemin ». WCAG 2.5.1 et 2.1.1 demandent une
 * alternative à un seul pointeur ou au clavier : « Écrire mon nom ». Le nom est
 * rendu dans le même canevas, envoyé de la même façon, et l'attestation dit
 * laquelle des deux voies a été prise.
 */
export function SignaturePad({ reservationId, documents }: { reservationId: string; documents: readonly Doc[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dessin = useRef<{ actif: boolean; x: number; y: number }>({ actif: false, x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>('trace');
  const [longueur, setLongueur] = useState(0);
  const [nom, setNom] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const idNom = useId();
  const idAide = useId();

  // En mode « nom », le canevas montre ce qui sera signé, lettre à lettre.
  useEffect(() => {
    if (mode !== 'saisie') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#14162e';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let taille = 56;
    ctx.font = `italic ${taille}px Georgia, 'Times New Roman', serif`;
    while (taille > 20 && ctx.measureText(nom).width > canvas.width - 48) {
      taille -= 2;
      ctx.font = `italic ${taille}px Georgia, 'Times New Roman', serif`;
    }
    ctx.fillText(nom, canvas.width / 2, canvas.height / 2);
  }, [mode, nom]);

  function effacer() {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setLongueur(0);
    setNom('');
  }

  function changerMode(m: Mode) {
    if (m === mode) return;
    effacer();
    setError(null);
    setMode(m);
  }

  function position(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== 'trace') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = position(e);
    dessin.current = { actif: true, ...p };
  }

  function trace(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessin.current.actif) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = position(e);
    ctx.strokeStyle = '#14162e';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(dessin.current.x, dessin.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setLongueur((l) => l + Math.hypot(p.x - dessin.current.x, p.y - dessin.current.y));
    dessin.current = { actif: true, ...p };
  }

  function fin() {
    dessin.current.actif = false;
  }

  async function signer() {
    setError(null);
    if (mode === 'trace' && longueur < LONGUEUR_MIN_TRACE) {
      setError('Tracez votre signature dans le cadre, ou choisissez « Écrire mon nom ».');
      return;
    }
    if (mode === 'saisie' && !/\p{L}.*\p{L}/u.test(nom.trim())) {
      setError('Écrivez votre prénom et votre nom.');
      return;
    }
    if (!consent) {
      setError('Cochez la case pour confirmer que vous avez lu et accepté les documents.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/v1/reservations/${reservationId}/signature`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          consent: true,
          signature_image: canvas.toDataURL('image/png'),
          signature_mode: mode,
          document_ids: documents.map((d) => d.id),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(res.status, body ?? { error: { code: 'CONFLICT', message: 'La signature n’a pas pu être enregistrée.' } });
      }
      router.push(`/espace-coach/reservations/${reservationId}/qr`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La signature n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.');
    } finally {
      setBusy(false);
    }
  }

  const liste = enumererDocuments(documents);

  return (
    <div className="auth-form signature__pad">
      <fieldset className="signature__modes">
        <legend className="vh">Comment voulez-vous signer ?</legend>
        <label className="signature__mode">
          <input type="radio" name="mode" checked={mode === 'trace'} onChange={() => changerMode('trace')} />
          <span>Dessiner ma signature</span>
        </label>
        <label className="signature__mode">
          <input type="radio" name="mode" checked={mode === 'saisie'} onChange={() => changerMode('saisie')} />
          <span>Écrire mon nom</span>
        </label>
      </fieldset>

      {mode === 'saisie' ? (
        <label htmlFor={idNom}>
          Prénom et nom
          <input
            id={idNom}
            type="text"
            autoComplete="name"
            value={nom}
            maxLength={60}
            onChange={(e) => setNom(e.target.value)}
            aria-describedby={idAide}
          />
        </label>
      ) : null}

      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        className="sign-pad"
        data-mode={mode}
        role="img"
        aria-label={mode === 'trace' ? 'Cadre de signature : tracez avec le doigt, un stylet ou la souris' : `Aperçu de la signature : ${nom || 'vide'}`}
        onPointerDown={debut}
        onPointerMove={trace}
        onPointerUp={fin}
        onPointerCancel={fin}
      />
      <p id={idAide} className="field-hint">
        {mode === 'trace'
          ? 'Tracez dans le cadre, comme sur papier.'
          : 'Votre nom saisi en toutes lettres vaut signature.'}
      </p>

      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>J’ai lu et j’accepte {liste}.</span>
      </label>

      <div role="alert" aria-live="assertive">
        {error ? <p className="form-error">{error}</p> : null}
      </div>

      <div className="signature__actions">
        <button type="button" className="btn btn-ghost" onClick={effacer} disabled={busy}>
          Effacer
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={signer} aria-busy={busy}>
          {busy ? 'Enregistrement…' : 'Signer et obtenir mon accès'}
        </button>
      </div>
    </div>
  );
}
