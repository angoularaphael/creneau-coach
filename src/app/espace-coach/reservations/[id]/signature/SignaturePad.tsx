'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/types';
import { enumererDocuments } from '@/lib/documents/noms';
import { IcoCheck, IcoDocument, IcoExterne, IcoStylo } from '@/components/espace-coach/Icones';

/** Un document tel que la page le montre : de quoi le lire, et de quoi le signer. */
export type DocASigner = {
  readonly id: string
  readonly kind: string
  readonly title: string
  /** `null` tant que le fichier n'est pas publié. */
  readonly version: string | null
  /** La page HTML du texte (lecture confortable au téléphone). */
  readonly page: string | null
  /** Le PDF, la version qui fait foi. */
  readonly pdf: string | null
}

type Mode = 'trace' | 'saisie';

/**
 * Un tracé en dessous de cette longueur (en pixels du canevas) n'est pas une
 * signature : c'est un clic ou un point. Sans ce seuil, on archivait une case
 * vide en guise de preuve.
 */
const LONGUEUR_MIN_TRACE = 120;

/**
 * La taille du canevas EN PIXELS D'IMAGE. La largeur ne bouge pas (640 : c'est
 * ce que l'attestation a toujours reçu) ; la HAUTEUR s'adapte à l'écran. Au
 * téléphone, 640 × 220 donnait un cadre de 118 px de haut : on signait sur une
 * ligne. 640 × 400 donne un vrai rectangle sous le pouce. Le rapport d'image
 * suit, donc le tracé n'est jamais déformé.
 */
const LARGEUR = 640;
const HAUTEUR_BUREAU = 240;
const HAUTEUR_TELEPHONE = 400;

/** Ce que le coach a ouvert, gardé le temps de l'onglet : revenir de la lecture ne remet pas à zéro. */
function cleOuverts(id: string) {
  return `ec-docs-ouverts:${id}`;
}

/**
 * LA LISTE DES TROIS DOCUMENTS — numérotée, chacun avec « Lire » et « PDF ».
 *
 * Un document ouvert se coche (« Ouvert »). Ce n'est PAS une condition pour
 * signer — le serveur n'en sait rien et ne doit rien en savoir — c'est un
 * repère pour le coach : il voit d'un coup d'œil ce qu'il a lu.
 */
export function ListeDocuments({
  documents,
  ouverts = [],
  onOuvrir,
}: {
  documents: readonly DocASigner[]
  ouverts?: readonly string[]
  onOuvrir?: (id: string) => void
}) {
  return (
    <ol className="ec-docs" aria-label="Les documents à signer">
      {documents.map((d, i) => {
        const ouvert = ouverts.includes(d.id);
        return (
          <li key={d.id} className="ec-doc" data-publie={Boolean(d.page) || undefined} data-ouvert={ouvert || undefined}>
            <span className="ec-doc__n ec-mono" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="ec-doc__corps">
              <span className="ec-doc__titre">{d.title}</span>
              <span className="ec-doc__meta">
                {d.version ? <span>Version {d.version}</span> : <span>En cours de publication</span>}
                {ouvert ? (
                  <span className="ec-doc__ouvert">
                    <IcoCheck taille={13} /> Ouvert
                  </span>
                ) : null}
              </span>
            </span>
            {d.page ? (
              <span className="ec-doc__liens">
                <a
                  className="btn btn-ghost ec-doc__lire"
                  href={d.page}
                  target="_blank"
                  rel="noopener"
                  onClick={() => onOuvrir?.(d.id)}
                >
                  <IcoDocument taille={17} />
                  Lire<span className="vh"> : {d.title} (nouvel onglet)</span>
                </a>
                {d.pdf ? (
                  <a className="ec-doc__pdf" href={d.pdf} target="_blank" rel="noopener" onClick={() => onOuvrir?.(d.id)}>
                    PDF<span className="vh"> : {d.title}</span>
                    <IcoExterne taille={13} />
                  </a>
                ) : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * La signature, au doigt ou au clavier.
 *
 * ── AU DOIGT ─────────────────────────────────────────────────────────────
 * `touch-action: none` (CSS) et la capture du pointeur : sans eux, sur un
 * téléphone, tracer faisait DÉFILER la page au lieu de dessiner, et un tracé
 * qui sortait du cadre s'interrompait. Le trait est lissé (courbes passant
 * par les milieux des segments) et son épaisseur est compensée par l'échelle
 * d'affichage : 2,6 px à l'écran, que le cadre fasse 343 ou 640 px de large.
 *
 * ── AU CLAVIER ───────────────────────────────────────────────────────────
 * Un tracé est un geste « de chemin ». WCAG 2.5.1 et 2.1.1 demandent une
 * alternative à un seul pointeur ou au clavier : « Écrire mon nom ». Le nom est
 * rendu dans le même canevas, envoyé de la même façon, et l'attestation dit
 * laquelle des deux voies a été prise.
 *
 * ── LE BOUTON ATTEND D'ÊTRE UTILE ────────────────────────────────────────
 * Il restait cliquable puis répondait par une erreur. Il est maintenant grisé
 * tant qu'il manque quelque chose, et la ligne juste en dessous dit QUOI. Les
 * contrôles d'avant l'envoi sont gardés tels quels : ils ne servent plus qu'en
 * filet.
 *
 * ── APRÈS ────────────────────────────────────────────────────────────────
 * Le succès se voit avant de partir : une coche se trace, « C'est signé », puis
 * le QR s'ouvre. Sans ce temps, on passait d'un formulaire à un code sans
 * savoir si la signature avait été prise.
 */
export function SignaturePad({
  reservationId,
  documents,
  nomSuggere = '',
}: {
  reservationId: string
  documents: readonly DocASigner[]
  nomSuggere?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dessin = useRef<{ actif: boolean; x: number; y: number; mx: number; my: number }>({
    actif: false,
    x: 0,
    y: 0,
    mx: 0,
    my: 0,
  });
  const [mode, setMode] = useState<Mode>('trace');
  const [hauteur, setHauteur] = useState(HAUTEUR_BUREAU);
  const [longueur, setLongueur] = useState(0);
  const [nom, setNom] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signe, setSigne] = useState(false);
  const [ouverts, setOuverts] = useState<string[]>([]);
  const router = useRouter();
  const idNom = useId();
  const idAide = useId();
  const idManque = useId();

  // La hauteur du cadre suit l'écran — décidée une fois, au montage : la
  // changer en cours de tracé effacerait la signature.
  useEffect(() => {
    if (window.matchMedia('(max-width: 559px)').matches) setHauteur(HAUTEUR_TELEPHONE);
  }, []);

  // Les documents déjà ouverts dans cet onglet.
  useEffect(() => {
    try {
      const brut = sessionStorage.getItem(cleOuverts(reservationId));
      if (brut) setOuverts(JSON.parse(brut) as string[]);
    } catch {
      /* stockage indisponible (navigation privée) : on repart de zéro, rien de grave */
    }
  }, [reservationId]);

  const ouvrir = useCallback(
    (id: string) => {
      setOuverts((avant) => {
        if (avant.includes(id)) return avant;
        const apres = [...avant, id];
        try {
          sessionStorage.setItem(cleOuverts(reservationId), JSON.stringify(apres));
        } catch {
          /* idem */
        }
        return apres;
      });
    },
    [reservationId],
  );

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
    let taille = Math.round(canvas.height * 0.3);
    ctx.font = `italic ${taille}px Georgia, 'Times New Roman', serif`;
    while (taille > 20 && ctx.measureText(nom).width > canvas.width - 64) {
      taille -= 2;
      ctx.font = `italic ${taille}px Georgia, 'Times New Roman', serif`;
    }
    ctx.fillText(nom, canvas.width / 2, canvas.height * 0.56);
  }, [mode, nom, hauteur]);

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
    if (mode !== 'trace' || signe) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = position(e);
    dessin.current = { actif: true, x: p.x, y: p.y, mx: p.x, my: p.y };
  }

  function trace(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessin.current.actif) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = position(e);
    const d = dessin.current;
    // Le point milieu : la courbe passe par les milieux et s'appuie sur les
    // points relevés. Un tracé en segments droits faisait des angles visibles
    // dès qu'on signait vite.
    const mx = (d.x + p.x) / 2;
    const my = (d.y + p.y) / 2;
    const echelle = canvas.width / canvas.getBoundingClientRect().width;
    ctx.strokeStyle = '#14162e';
    ctx.lineWidth = 2.6 * echelle;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(d.mx, d.my);
    ctx.quadraticCurveTo(d.x, d.y, mx, my);
    ctx.stroke();
    setLongueur((l) => l + Math.hypot(p.x - d.x, p.y - d.y));
    dessin.current = { actif: true, x: p.x, y: p.y, mx, my };
  }

  function fin() {
    dessin.current.actif = false;
  }

  const signatureFaite = mode === 'trace' ? longueur >= LONGUEUR_MIN_TRACE : /\p{L}.*\p{L}/u.test(nom.trim());
  const pret = signatureFaite && consent;
  const manque = [
    !signatureFaite ? (mode === 'trace' ? 'tracez votre signature dans le cadre' : 'écrivez votre prénom et votre nom') : null,
    !consent ? 'cochez la case d’accord' : null,
  ].filter(Boolean) as string[];
  const nonOuverts = documents.filter((d) => d.page && !ouverts.includes(d.id));

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
      // Le succès se VOIT avant de partir — moins longtemps si le visiteur a
      // demandé moins de mouvement.
      setSigne(true);
      const pause = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1500;
      window.setTimeout(() => {
        router.push(`/espace-coach/reservations/${reservationId}/qr`);
        router.refresh();
      }, pause);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La signature n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.');
      setBusy(false);
    }
  }

  const liste = enumererDocuments(documents);

  return (
    <div className="ec-signature__grille">
      <div className="ec-signature__lire ec-entree" style={{ ['--d' as string]: 3 }}>
        <h2 className="ec-signature__etape">
          <span className="ec-mono">1</span> Lisez
        </h2>
        <ListeDocuments documents={documents} ouverts={ouverts} onOuvrir={ouvrir} />
        <p className="ec-signature__aide">
          Chaque texte s’ouvre dans un nouvel onglet, sans quitter cette page. Le PDF est la version qui fait foi.
        </p>
      </div>

      <div className="ec-signer ec-entree" style={{ ['--d' as string]: 4 }} data-signe={signe || undefined}>
        <div className="ec-signer__tete">
          <h2 className="ec-signature__etape">
            <span className="ec-mono">2</span> Signez
          </h2>
          <fieldset className="ec-bascule" data-mode={mode} disabled={busy}>
            <legend className="vh">Comment voulez-vous signer ?</legend>
            <label className="ec-bascule__choix">
              <input type="radio" name="mode" checked={mode === 'trace'} onChange={() => changerMode('trace')} />
              <span>Dessiner</span>
            </label>
            <label className="ec-bascule__choix">
              <input type="radio" name="mode" checked={mode === 'saisie'} onChange={() => changerMode('saisie')} />
              <span>Écrire mon nom</span>
            </label>
          </fieldset>
        </div>

        {mode === 'saisie' ? (
          <label className="ec-signer__nom" htmlFor={idNom}>
            <span>Prénom et nom</span>
            <input
              id={idNom}
              type="text"
              autoComplete="name"
              value={nom}
              maxLength={60}
              placeholder={nomSuggere || 'Prénom Nom'}
              onChange={(e) => setNom(e.target.value)}
              aria-describedby={idAide}
              disabled={busy}
            />
          </label>
        ) : null}

        <div className="ec-pad" data-mode={mode} data-vide={(mode === 'trace' ? longueur === 0 : !nom) || undefined}>
          <canvas
            ref={canvasRef}
            width={LARGEUR}
            height={hauteur}
            className="sign-pad ec-pad__toile"
            data-mode={mode}
            role="img"
            aria-label={mode === 'trace' ? 'Cadre de signature : tracez avec le doigt, un stylet ou la souris' : `Aperçu de la signature : ${nom || 'vide'}`}
            aria-describedby={idAide}
            onPointerDown={debut}
            onPointerMove={trace}
            onPointerUp={fin}
            onPointerCancel={fin}
          />
          <span className="ec-pad__invite" aria-hidden="true">
            <IcoStylo taille={18} />
            {mode === 'trace' ? 'Signez ici' : 'Votre nom s’écrit ici'}
          </span>
          <span className="ec-pad__ligne" aria-hidden="true">
            <span>×</span>
          </span>
          <button type="button" className="ec-pad__effacer" onClick={effacer} disabled={busy || signe}>
            Effacer
          </button>

          {signe ? (
            <div className="ec-pad__succes" role="status">
              <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l7.5 7.5L38 19" />
              </svg>
              <p>
                <b>C’est signé.</b>
                <span>Votre accès s’ouvre…</span>
              </p>
            </div>
          ) : null}
        </div>
        <p id={idAide} className="ec-signer__aide">
          {mode === 'trace'
            ? 'Au doigt, au stylet ou à la souris, comme sur papier.'
            : 'Votre nom écrit en toutes lettres vaut signature.'}
        </p>

        <label className="ec-accord">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
          <span className="ec-accord__case" aria-hidden="true">
            <IcoCheck taille={14} />
          </span>
          <span>J’ai lu et j’accepte {liste}.</span>
        </label>

        {nonOuverts.length && !signe ? (
          <p className="ec-signer__rappel">
            {nonOuverts.length === documents.length
              ? 'Aucun document ouvert pour l’instant.'
              : nonOuverts.length === 1
                ? `Pas encore ouvert : ${nonOuverts[0]!.title}.`
                : `Encore ${nonOuverts.length} documents non ouverts.`}{' '}
            Rien ne vous y oblige — mais c’est ce que vous signez.
          </p>
        ) : null}

        <div role="alert" aria-live="assertive">
          {error ? <p className="form-error ec-erreur">{error}</p> : null}
        </div>

        <button
          type="button"
          className="btn ec-btn-cuivre ec-signer__bouton"
          disabled={!pret || busy}
          onClick={signer}
          aria-busy={busy}
          aria-describedby={manque.length ? idManque : undefined}
        >
          <IcoStylo taille={19} />
          {signe ? 'Signé' : busy ? 'Enregistrement…' : 'Signer et obtenir mon accès'}
        </button>
        <p id={idManque} className="ec-signer__manque" aria-live="polite">
          {manque.length && !busy ? (
            <>Pour signer : {manque.join(', puis ')}.</>
          ) : !busy ? (
            <>
              <IcoCheck taille={14} /> Tout est prêt.
            </>
          ) : null}
        </p>

        <p className="ec-signer__legal">
          Votre signature est horodatée et jointe {documents.length === 3 ? 'aux trois documents' : `aux ${documents.length} documents`},
          pour cette réservation uniquement. Une attestation en PDF reste disponible dans votre espace.
        </p>
      </div>
    </div>
  );
}
