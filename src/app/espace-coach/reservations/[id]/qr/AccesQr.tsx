'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AffichageQr, Fenetre } from '@/domain/qr-fenetre';
import { Cadran } from '@/components/espace-coach/Cadran';
import { useAZero, useMaintenant } from '@/components/espace-coach/horloge';
import { decompteCourt, heure } from '@/components/espace-coach/temps';
import { IcoCadenas, IcoCroix, IcoPlus, IcoSoleil } from '@/components/espace-coach/Icones';

/**
 * LE QR, VIVANT.
 *
 * ── AVANT L'HEURE ────────────────────────────────────────────────────────
 * Un code verrouillé : une silhouette de QR (brouillée, et de toute façon
 * fabriquée à partir de l'identifiant de la réservation — elle n'ouvre rien)
 * sous un cadenas, et le cadran qui décompte jusqu'à l'ouverture. À zéro, la
 * page se relit côté serveur ET le vrai code apparaît, sans que le coach
 * recharge quoi que ce soit. Il peut arriver devant la porte avec la page
 * ouverte depuis la veille.
 *
 * ── PENDANT ──────────────────────────────────────────────────────────────
 * Le code en grand sur blanc pur, entouré de quatre coins de viseur : c'est là
 * qu'on vise. Un toucher l'agrandit en plein écran (le contraste maximal, au
 * soleil, devant un lecteur). L'écran est maintenu allumé (Wake Lock) tant que
 * le code est affiché : un téléphone qui se met en veille au moment de passer
 * la porte, c'est le défaut qu'on entend le plus. Une jauge dit combien de
 * temps il reste avant qu'il s'éteigne.
 *
 * ── LE CODE PRÉPARÉ ──────────────────────────────────────────────────────
 * L'heure est là mais l'accès n'est pas encore remonté du système du club :
 * on relit la page toutes les 15 secondes au lieu de demander au coach de
 * « recharger plus tard ».
 */

type Props = {
  id: string
  fenetre: Fenetre
  affichage: AffichageQr
  png: string
  de: string
  a: string
  maintenant: number
  club: string
}

/** Une silhouette de QR déterministe — décorative, floutée, jamais lisible. */
function silhouette(graine: string, n = 21): boolean[] {
  let h = 2166136261;
  for (const c of graine) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const cases: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    cases.push(((h >>> 7) & 3) === 0 || ((h >>> 11) & 1) === 1);
  }
  return cases;
}

export function AccesQr({ id, fenetre, affichage, png, de, a, maintenant, club }: Props) {
  const router = useRouter();
  const t = useMaintenant(maintenant);
  const [grand, setGrand] = useState(false);
  const [eveille, setEveille] = useState(false);
  const debut = new Date(de).getTime();
  const fin = new Date(a).getTime();
  const resteFin = Math.max(0, fin - t);
  const ouvert = affichage === 'afficher' && Boolean(png);

  // À la fin de la fenêtre, la page se relit : le code disparaît de lui-même.
  useAZero(ouvert ? resteFin : 1, () => router.refresh());

  // L'écran reste allumé tant que le code est affiché.
  useEffect(() => {
    if (!ouvert) return;
    let verrou: WakeLockSentinel | null = null;
    let actif = true;
    const demander = async () => {
      try {
        if (!('wakeLock' in navigator)) return;
        verrou = await navigator.wakeLock.request('screen');
        if (actif) setEveille(true);
        verrou.addEventListener('release', () => actif && setEveille(false));
      } catch {
        if (actif) setEveille(false);
      }
    };
    void demander();
    const auRetour = () => {
      if (document.visibilityState === 'visible') void demander();
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      actif = false;
      document.removeEventListener('visibilitychange', auRetour);
      verrou?.release().catch(() => {});
    };
  }, [ouvert]);

  // Code en préparation : on relit toutes les 15 secondes.
  useEffect(() => {
    if (affichage !== 'preparation') return;
    const i = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(i);
  }, [affichage, router]);

  // Échap ferme le plein écran, et la page derrière ne défile plus pendant
  // qu'il est ouvert : un pouce qui glisse ne doit pas faire sortir le code.
  useEffect(() => {
    if (!grand) return;
    const fermer = (e: KeyboardEvent) => e.key === 'Escape' && setGrand(false);
    const avant = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', fermer);
    return () => {
      window.removeEventListener('keydown', fermer);
      document.documentElement.style.overflow = avant;
    };
  }, [grand]);

  const cases = useMemo(() => silhouette(id), [id]);

  // ── TROP TÔT : verrouillé, avec le décompte ───────────────────────────
  if (fenetre === 'trop_tot' && t < debut) {
    return (
      <div className="ec-qr" data-etat="attente">
        <div className="ec-qr__verrou">
          <div className="ec-qr__fantome" aria-hidden="true">
            <svg viewBox="0 0 21 21" shapeRendering="crispEdges">
              {cases.map((plein, i) =>
                plein ? <rect key={i} x={i % 21} y={Math.floor(i / 21)} width={1} height={1} /> : null,
              )}
            </svg>
          </div>
          <div className="ec-qr__cadran">
            <Cadran
              cible={de}
              maintenant={maintenant}
              surtitre="Ouverture dans"
              legende={`à ${heure(de)}`}
              legendeFin="C’est ouvert"
              rafraichir
              etiquette="Temps restant avant l’ouverture de votre accès"
            />
          </div>
        </div>
        <p className="ec-qr__titre">
          <IcoCadenas taille={18} />
          Prêt, sous clé jusqu’à <b className="ec-mono">{heure(de)}</b>
        </p>
        <p className="ec-qr__texte">
          Cinq minutes avant votre séance, le code apparaît ici tout seul, sans recharger. Gardez simplement
          cette page sous la main.
        </p>
      </div>
    );
  }

  // ── FINI ──────────────────────────────────────────────────────────────
  if (fenetre === 'expire' || (ouvert && resteFin <= 0)) {
    return (
      <div className="ec-qr" data-etat="fini">
        <p className="ec-qr__titre">Ce créneau est terminé</p>
        <p className="ec-qr__texte">
          Le code s’est éteint à {heure(a)}. Il n’ouvre plus la porte de {club}. On remet ça ?
        </p>
        <a className="btn ec-btn-encre" href="/clubs">
          <IcoPlus taille={18} />
          Réserver une nouvelle heure
        </a>
      </div>
    );
  }

  // ── L'HEURE EST LÀ, LE CODE SE PRÉPARE ───────────────────────────────
  if (!ouvert) {
    return (
      <div className="ec-qr" data-etat="preparation" role="status">
        <div className="ec-qr__prepa" aria-hidden="true" />
        <p className="ec-qr__titre">Votre accès se prépare</p>
        <p className="ec-qr__texte">
          Le club enregistre votre code. Il s’affiche ici dans quelques secondes : inutile de recharger.
        </p>
      </div>
    );
  }

  // ── OUVERT : LE CODE ──────────────────────────────────────────────────
  const fraction = Math.min(1, resteFin / Math.max(1, fin - debut));
  return (
    <div className="ec-qr" data-etat="ouvert">
      <p className="ec-qr__statut">
        <span className="ec-qr__point" aria-hidden="true" />
        Accès ouvert · {club}
      </p>
      <button
        type="button"
        className="ec-qr__code"
        onClick={() => setGrand(true)}
        aria-label="Afficher le code en plein écran"
      >
        <span className="ec-qr__viseur" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={png} alt={`QR d’accès, Boxing Center ${club}`} width={360} height={360} />
      </button>
      <div className="ec-qr__jauge" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <p className="ec-qr__texte ec-qr__texte--centre">
        Présentez-le au lecteur de l’entrée. Il s’éteint à <b className="ec-mono">{heure(a)}</b> — encore{' '}
        <b className="ec-mono">{decompteCourt(resteFin)}</b>.
      </p>
      <p className="ec-qr__eveil" data-actif={eveille || undefined}>
        <IcoSoleil taille={16} />
        {eveille ? 'L’écran reste allumé tant que le code est affiché.' : 'Touchez le code pour l’agrandir.'}
      </p>

      {grand ? (
        <div className="ec-qr__plein" role="dialog" aria-modal="true" aria-label="Code d’accès en plein écran">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={png} alt={`QR d’accès, Boxing Center ${club}`} />
          <p>Boxing Center {club} · jusqu’à {heure(a)}</p>
          <button type="button" className="btn ec-btn-encre" onClick={() => setGrand(false)} autoFocus>
            <IcoCroix taille={18} />
            Fermer
          </button>
        </div>
      ) : null}
    </div>
  );
}
