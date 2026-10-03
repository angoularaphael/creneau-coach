'use client';

import { cacherChargement, montrerChargement } from '@/components/IndicateurNavigation';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import type { ClubId, Slot, Space } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import {
  checkoutReservation,
  createReservation,
  formatCents,
  listSlots,
  newIdempotencyKey,
} from '@/lib/api/client';
import { estUrlCheckoutSure } from '@/lib/paiement-url';
import { prixCourt } from '@/domain/contrat';

/**
 * LE RÉSERVATEUR — la grille, la semaine, l'espace et le paiement, sur une page.
 *
 * Avant le 01/10/2026, réserver une heure demandait :
 *   1. deux champs date natifs et un bouton « Afficher » — chaque changement de
 *      semaine rechargeait TOUTE la page (photo, en-tête, sections, session) ;
 *   2. un clic sur un créneau, qui posait l'option sans rien montrer ;
 *   3. une seconde page pour choisir comment payer ;
 *   4. sans compte, un renvoi vers la connexion qui oubliait le créneau.
 *
 * Désormais : la semaine et l'espace changent sur place (seule la grille est
 * relue, par l'API), un créneau ouvre un récapitulatif, et le bouton de
 * paiement pose l'option ET part au paiement dans le même geste. Sans compte,
 * le récapitulatif mène à la connexion, qui ramène ICI, créneau rouvert.
 *
 * ── UN SEUL BALISAGE, DEUX DISPOSITIONS ──────────────────────────────────
 * Sur téléphone, la grille devient un agenda vertical, jour après jour ; dès la
 * tablette, une grille jour × heure. C'est la MÊME liste réordonnée par la CSS :
 * un lecteur d'écran ne lit rien en double.
 *
 * ── L'HEURE EST CELLE DE PARIS ───────────────────────────────────────────
 * Jour et heure sont calculés avec `timeZone: 'Europe/Paris'`, jamais avec
 * l'heure du navigateur : un coach en déplacement ne voit rien glisser.
 */

const ETAT_LIBELLE: Record<Slot['state'], string> = {
  open: 'Libre',
  full: 'Complet',
  blocked: 'Cours du club',
  past: 'Passé',
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;
/** Combien de semaines à l'avance on peut parcourir. */
const HORIZON_SEMAINES = 12;

const fmtJourCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit' });
const fmtJourLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const fmtBorne = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });

function partiesParis(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { cleJour: `${v('year')}-${v('month')}-${v('day')}`, minutes: Number(v('hour')) * 60 + Number(v('minute')), date: d };
}

function ajouterJours(iso: string, jours: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

function libelleSemaine(du: string): string {
  const fin = ajouterJours(du, 6);
  return `${fmtBorne.format(new Date(`${du}T12:00:00Z`))} – ${fmtBorne.format(new Date(`${fin}T12:00:00Z`))}`;
}

type Props = {
  clubId: ClubId;
  /** Nom court affiché dans le récapitulatif (« Minimes »). */
  clubNom: string;
  /** Chemin canonique de la page club (`/clubs/coaching-toulouse-minimes`). */
  chemin: string;
  spaces: Space[];
  spaceId: string;
  /** Premier jour affiché (AAAA-MM-JJ, Paris). */
  du: string;
  /** Aujourd'hui à Paris — borne basse de la navigation. */
  aujourdhui: string;
  slots: Slot[];
  loggedIn: boolean;
  creditsCents?: number;
  paypalDisponible?: boolean;
  paiementsTest?: boolean;
  /** Créneau à rouvrir au retour de la connexion (ISO). */
  creneauInitial?: string;
};

type Moyen = 'payplug' | 'paypal' | 'credit';

export function Calendrier(props: Props) {
  const { clubId, clubNom, chemin, spaces, aujourdhui, loggedIn } = props;
  const router = useRouter();

  const [spaceId, setSpaceId] = useState(props.spaceId);
  const [du, setDu] = useState(props.du);
  const [slots, setSlots] = useState<Slot[]>(props.slots);
  const [chargement, demarrer] = useTransition();
  const [erreurGrille, setErreurGrille] = useState<string | null>(null);

  /** Sur téléphone, UN jour à la fois : la bande de jours remplace 60 boutons empilés. */
  const [jourActif, setJourActif] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<Slot | null>(null);
  const [envoi, setEnvoi] = useState<Moyen | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cleIdem = useRef<string>('');
  const dialogue = useRef<HTMLDialogElement>(null);

  const limite = ajouterJours(aujourdhui, HORIZON_SEMAINES * 7);
  const espace = spaces.find((s) => s.id === spaceId);

  /** Relit la grille par l'API, sans recharger la page, et garde l'URL partageable. */
  // Ce qui est réellement affiché : une relecture ratée y ramène l'étiquette de
  // semaine et l'espace — jamais « 8–14 oct. » au-dessus de la grille du 1er.
  const affiche = useRef({ du: props.du, spaceId: props.spaceId });

  const charger = useCallback(
    (prochainDu: string, prochainEspace: string) => {
      setErreurGrille(null);
      demarrer(async () => {
        try {
          const g = await listSlots(clubId, { from: prochainDu, to: ajouterJours(prochainDu, 6), space_id: prochainEspace });
          setSlots(g.slots);
          affiche.current = { du: prochainDu, spaceId: prochainEspace };
          const q = new URLSearchParams({ space_id: prochainEspace, from: prochainDu });
          window.history.replaceState(null, '', `${chemin}?${q.toString()}`);
        } catch {
          setDu(affiche.current.du);
          setSpaceId(affiche.current.spaceId);
          setErreurGrille('Le planning n’a pas pu être chargé. Vérifiez votre connexion et réessayez.');
        }
      });
    },
    [chemin, clubId],
  );

  function allerA(prochainDu: string) {
    const borne = prochainDu < aujourdhui ? aujourdhui : prochainDu > limite ? limite : prochainDu;
    setDu(borne);
    charger(borne, spaceId);
  }

  function changerEspace(id: string) {
    if (id === spaceId) return;
    setSpaceId(id);
    charger(du, id);
  }

  function ouvrir(s: Slot) {
    if (s.state !== 'open') return;
    // Sur téléphone, la bande de jours se cale sur le jour du créneau ouvert :
    // derrière la fiche, on voit la bonne journée, pas une autre.
    setJourActif(partiesParis(s.starts_at).cleJour);
    setChoisi(s);
    setErreur(null);
    setEnvoi(null);
    cleIdem.current = newIdempotencyKey();
  }

  function fermer() {
    if (envoi) return; // un paiement en route ne s'abandonne pas d'un clic à côté
    setChoisi(null);
  }

  // Le dialogue natif : focus piégé, Échap, fond inerte — sans bibliothèque.
  useEffect(() => {
    const d = dialogue.current;
    if (!d) return;
    if (choisi && !d.open) d.showModal();
    if (!choisi && d.open) d.close();
  }, [choisi]);

  // Retour de la connexion : le créneau demandé se rouvre tout seul.
  useEffect(() => {
    // Ouverte aussi sans compte : la fiche propose alors la connexion, qui
    // ramène ici. Un lien « libre maintenant » de l'accueil mène donc droit
    // à l'heure choisie, connecté ou pas.
    if (!props.creneauInitial) return;
    const s = props.slots.find((x) => x.starts_at === props.creneauInitial || new Date(x.starts_at).toISOString() === props.creneauInitial);
    if (s && s.state === 'open') ouvrir(s);
    // une seule fois, au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function payer(moyen: Moyen) {
    if (!choisi) return;
    setEnvoi(moyen);
    setErreur(null);
    let reservationId: string | null = null;
    try {
      const r = await createReservation({ club_id: clubId, space_id: spaceId, starts_at: choisi.starts_at }, cleIdem.current);
      reservationId = r.id;
      const res = await checkoutReservation(r.id, moyen);
      if (res.checkout_url && estUrlCheckoutSure(res.checkout_url)) {
        // Le logo tourne jusqu'à l'arrivée sur la page du prestataire.
        montrerChargement(moyen === 'paypal' ? 'Ouverture de PayPal…' : 'Ouverture du paiement sécurisé…');
        window.location.href = res.checkout_url;
        return;
      }
      if (res.checkout_url) throw new Error('lien de paiement refusé');
      // Avoir : payé sur place, on passe directement à la signature.
      montrerChargement('Ouverture de la signature…');
      router.push(`/espace-coach/reservations/${r.id}/signature`);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : 'Le paiement n’a pas pu démarrer. Vérifiez votre connexion et réessayez.';
      if (reservationId) {
        // L'option est posée : la page de la réservation permet de réessayer
        // le paiement sans reperdre la place.
        router.push(`/espace-coach/reservations/${reservationId}`);
        return;
      }
      cacherChargement();
      setErreur(message);
      setEnvoi(null);
      charger(du, spaceId); // la place a peut-être été prise entre-temps
    }
  }

  const modele = useMemo(() => {
    if (slots.length === 0) return null;
    const parJour = new Map<string, { date: Date; creneaux: Slot[] }>();
    let min = 24 * 60;
    let max = 0;
    for (const s of slots) {
      const d = partiesParis(s.starts_at);
      const f = partiesParis(s.ends_at);
      const finMinutes = f.minutes <= d.minutes ? 24 * 60 : f.minutes;
      min = Math.min(min, d.minutes);
      max = Math.max(max, finMinutes);
      const entree = parJour.get(d.cleJour) ?? { date: d.date, creneaux: [] };
      entree.creneaux.push(s);
      parJour.set(d.cleJour, entree);
    }
    const heureDebut = Math.floor(min / 60);
    const heureFin = Math.ceil(max / 60);
    const jours = [...parJour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cle, v]) => ({ cle, ...v }));
    const libres = slots.filter((s) => s.state === 'open').length;
    return { jours, heureDebut, nbHeures: heureFin - heureDebut, libres };
  }, [slots]);

  // Le jour ouvert par défaut : le premier qui a encore une heure libre.
  const jourOuvert =
    modele && jourActif && modele.jours.some((j) => j.cle === jourActif)
      ? jourActif
      : (modele?.jours.find((j) => j.creneaux.some((s) => s.state === 'open'))?.cle ?? modele?.jours[0]?.cle ?? null);

  const retour = choisi
    ? `${chemin}?${new URLSearchParams({ space_id: spaceId, from: du, creneau: choisi.starts_at }).toString()}`
    : chemin;
  const creditsSuffisants = choisi ? (props.creditsCents ?? 0) >= choisi.amount_cents : false;
  const test = props.paiementsTest ? ' (mode test)' : '';

  return (
    <div className="resa" aria-busy={chargement}>
      {/* ── LA BARRE : l'espace, puis la semaine ─────────────────────────── */}
      <div className="resa__barre">
        {spaces.length > 1 ? (
          <div className="resa__espaces" role="radiogroup" aria-label="Espace">
            {spaces.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === spaceId}
                className="resa__espace"
                onClick={() => changerEspace(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="resa__semaine">
          <button
            type="button"
            className="resa__fleche"
            onClick={() => allerA(ajouterJours(du, -7))}
            disabled={du <= aujourdhui || chargement}
            aria-label="Semaine précédente"
          >
            ‹
          </button>
          <p className="resa__dates" aria-live="polite">
            <span>{libelleSemaine(du)}</span>
            {modele ? (
              <small>
                {modele.libres} heure{modele.libres > 1 ? 's' : ''} libre{modele.libres > 1 ? 's' : ''}
              </small>
            ) : null}
          </p>
          <button
            type="button"
            className="resa__fleche"
            onClick={() => allerA(ajouterJours(du, 7))}
            disabled={du >= limite || chargement}
            aria-label="Semaine suivante"
          >
            ›
          </button>
          {du !== aujourdhui ? (
            <button type="button" className="resa__lien" onClick={() => allerA(aujourdhui)}>
              Aujourd’hui
            </button>
          ) : null}
          <label className="resa__aller">
            <span className="vh">Aller à une date</span>
            <input
              type="date"
              min={aujourdhui}
              max={limite}
              value={du}
              onChange={(e) => e.target.value && allerA(e.target.value)}
            />
          </label>
        </div>
      </div>

      {erreurGrille ? (
        <p className="form-error" role="alert">
          {erreurGrille}
        </p>
      ) : null}

      {!modele ? (
        <p className="resa__vide">
          Aucune heure ouverte sur cette semaine{espace ? ` en ${espace.name.toLowerCase()}` : ''}. Essayez la semaine
          suivante.
        </p>
      ) : (
        <>
          <div className="resa__jours" role="tablist" aria-label="Jour">
            {modele.jours.map((jour) => {
              const n = jour.creneaux.filter((s) => s.state === 'open').length;
              return (
                <button
                  key={jour.cle}
                  type="button"
                  role="tab"
                  aria-selected={jour.cle === jourOuvert}
                  className="resa__jour"
                  data-vide={n === 0 || undefined}
                  onClick={() => setJourActif(jour.cle)}
                >
                  <span>{fmtJourCourt.format(jour.date).replace('.', '')}</span>
                  <small>{n ? `${n} libre${n > 1 ? 's' : ''}` : '—'}</small>
                </button>
              );
            })}
          </div>

          <div
            className="cal"
            data-chargement={chargement || undefined}
            style={{ ['--jours' as string]: modele.jours.length }}
          >
            <div className="cal__heures" aria-hidden="true">
              {Array.from({ length: modele.nbHeures }, (_, i) => (
                <span className="cal__heure" key={i} style={{ ['--h' as string]: i }}>
                  {String(modele.heureDebut + i).padStart(2, '0')}h
                </span>
              ))}
            </div>

            {modele.jours.map((jour) => {
              const nomJour = JOURS[new Date(`${jour.cle}T12:00:00Z`).getUTCDay()];
              const libresDuJour = jour.creneaux.filter((s) => s.state === 'open').length;
              return (
                <section
                  className="cal__jour"
                  key={jour.cle}
                  data-actif={jour.cle === jourOuvert || undefined}
                  aria-label={fmtJourLong.format(jour.date)}
                >
                  <h3 className="cal__titre-jour">
                    <span className="cal__jour-court">{fmtJourCourt.format(jour.date)}</span>
                    <span className="cal__jour-long">{fmtJourLong.format(jour.date)}</span>
                    <span className="cal__jour-libres">
                      {libresDuJour ? `${libresDuJour} libre${libresDuJour > 1 ? 's' : ''}` : 'complet'}
                    </span>
                  </h3>

                  <div className="cal__piste" style={{ ['--fin' as string]: modele.nbHeures }}>
                    {jour.creneaux.map((s) => {
                      const d = partiesParis(s.starts_at);
                      const f = partiesParis(s.ends_at);
                      const fin = f.minutes <= d.minutes ? 24 * 60 : f.minutes;
                      const haut = (d.minutes - modele.heureDebut * 60) / 60;
                      const duree = Math.max((fin - d.minutes) / 60, 0.5);
                      const libre = s.state === 'open';
                      const heures = `${fmtHeure.format(new Date(s.starts_at))} – ${fmtHeure.format(new Date(s.ends_at))}`;
                      return (
                        <button
                          key={s.starts_at}
                          type="button"
                          className="cal__creneau"
                          data-etat={s.mine ? 'mien' : s.state}
                          data-tarif={s.tariff}
                          aria-pressed={choisi?.starts_at === s.starts_at}
                          style={{ ['--haut' as string]: haut, ['--duree' as string]: duree }}
                          disabled={!libre}
                          onClick={() => ouvrir(s)}
                          aria-label={`${heures}, ${nomJour} — ${s.mine ? 'déjà réservé par vous' : ETAT_LIBELLE[s.state]}${
                            libre ? `, ${formatCents(s.amount_cents)}` : ''
                          }`}
                        >
                          <span className="cal__h">{heures}</span>
                          {s.mine ? (
                            <span className="cal__etat">Votre heure</span>
                          ) : libre ? (
                            <span className="cal__prix">{prixCourt(s.amount_cents)}</span>
                          ) : (
                            <span className="cal__etat">{ETAT_LIBELLE[s.state]}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="cal__legende">
            <span className="cal__pastille" data-etat="open" /> Libre — touchez pour réserver
            <span className="cal__pastille" data-etat="full" /> Complet
            <span className="cal__pastille" data-etat="blocked" /> Cours du club
            <span className="cal__pastille" data-etat="past" /> Passé
          </p>
        </>
      )}

      {/* ── LE RÉCAPITULATIF ─────────────────────────────────────────────
          Ce que le coach achète, en une phrase, puis UN geste : payer.
          L'option (10 minutes) ne se pose qu'à ce moment-là — feuilleter la
          grille ne bloque la place de personne. */}
      <dialog
        ref={dialogue}
        className="resa-fiche"
        aria-labelledby="resa-fiche-titre"
        onCancel={(e) => {
          e.preventDefault();
          fermer();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) fermer();
        }}
      >
        {choisi ? (
          <div className="resa-fiche__corps">
            <button type="button" className="resa-fiche__fermer" onClick={fermer} aria-label="Fermer" disabled={!!envoi}>
              ×
            </button>
            <p className="resa-fiche__lieu">
              {clubNom}
              {espace && spaces.length > 1 ? ` · ${espace.name}` : ''}
            </p>
            <h2 id="resa-fiche-titre" className="resa-fiche__titre">
              {fmtJourLong.format(new Date(choisi.starts_at))}
              <span>
                {fmtHeure.format(new Date(choisi.starts_at))} – {fmtHeure.format(new Date(choisi.ends_at))}
              </span>
            </h2>
            <p className="resa-fiche__prix">
              <strong>{prixCourt(choisi.amount_cents)}</strong>
              <span>{choisi.tariff === 'peak' ? 'heure pleine' : 'heure creuse'} · prix fixé, sans abonnement</span>
            </p>

            <ol className="resa-fiche__etapes">
              <li>Vous payez — la place est gardée 10 minutes pendant le paiement.</li>
              <li>Vous signez les trois documents, une seule fois par réservation.</li>
              <li>Votre QR d’accès ouvre la salle à l’heure du créneau.</li>
            </ol>

            {erreur ? (
              <p className="form-error" role="alert">
                {erreur}
              </p>
            ) : null}

            {loggedIn ? (
              <div className="resa-fiche__actions">
                <button type="button" className="btn btn-primary" disabled={!!envoi} onClick={() => payer('payplug')}>
                  {envoi === 'payplug' ? 'Ouverture du paiement sécurisé…' : `Payer ${prixCourt(choisi.amount_cents)} par carte${test}`}
                </button>
                {props.paypalDisponible ? (
                  <button type="button" className="btn btn-ghost" disabled={!!envoi} onClick={() => payer('paypal')}>
                    {envoi === 'paypal' ? 'Ouverture de PayPal…' : `Payer avec PayPal${test}`}
                  </button>
                ) : null}
                {creditsSuffisants ? (
                  <button type="button" className="btn btn-ghost" disabled={!!envoi} onClick={() => payer('credit')}>
                    {envoi === 'credit'
                      ? 'Paiement avec votre avoir…'
                      : `Utiliser mon avoir (${formatCents(props.creditsCents ?? 0)} disponibles)`}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="resa-fiche__actions">
                <a className="btn btn-primary" href={`/auth/connexion?next=${encodeURIComponent(retour)}`}>
                  Me connecter pour réserver
                </a>
                <a className="btn btn-ghost" href={`/auth/inscription?next=${encodeURIComponent(retour)}`}>
                  Créer mon compte — gratuit
                </a>
                <p className="resa-fiche__note">Vous revenez ici, sur ce créneau, juste après.</p>
              </div>
            )}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
