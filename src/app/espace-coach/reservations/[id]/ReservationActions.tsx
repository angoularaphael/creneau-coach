'use client';

import { cacherChargement, montrerChargement } from '@/components/IndicateurNavigation';
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
import { libelleStatut } from '@/lib/libelles-coach';
import { REGLAGES_DEFAUT } from '@/domain/contrat';
import { RESEAU } from '@/lib/seo/verite';
import { Cadran } from '@/components/espace-coach/Cadran';
import { Decompte } from '@/components/espace-coach/Decompte';
import { Parcours } from '@/components/espace-coach/ParcoursEtapes';
import { useMaintenant } from '@/components/espace-coach/horloge';
import { heure, jourLong } from '@/components/espace-coach/temps';
import type { EtatEtape } from '@/components/espace-coach/parcours';
import {
  IcoAlerte,
  IcoAvoir,
  IcoCadenas,
  IcoCarte,
  IcoCheck,
  IcoFleche,
  IcoPaypal,
  IcoQr,
  IcoStylo,
} from '@/components/espace-coach/Icones';

/**
 * LE GESTE DU MOMENT, sur la fiche d'une réservation.
 *
 * ── CE QUI N'A PAS BOUGÉ ─────────────────────────────────────────────────
 * Les appels : `checkoutReservation` (carte, PayPal, avoir), la vérification
 * de l'adresse de paiement reçue avant d'y envoyer le coach, `cancelReservation`
 * après confirmation, le passage à la signature quand l'avoir a payé. Les
 * messages d'erreur sont ceux du serveur.
 *
 * ── CE QUI A CHANGÉ ──────────────────────────────────────────────────────
 * 1. LA HIÉRARCHIE. Quatre boutons de même poids devenaient : la carte en
 *    premier et en grand, PayPal et l'avoir côte à côte en dessous, et
 *    « Libérer ce créneau » en lien discret tout en bas. On ne met pas
 *    « abandonner » au niveau de « payer ».
 *
 * 2. LE DÉLAI SE VOIT ET SE VIT. « Gardée jusqu'à 11:22 » obligeait à
 *    regarder l'heure et à soustraire. Le cadran décompte les minutes ; à
 *    zéro, la fiche bascule d'elle-même sur « délai écoulé » — sans recharger,
 *    sans laisser un bouton « Payer » qui échouerait.
 *
 * 3. UN BOUTON QUI MÈNE À UNE IMPASSE N'EST PAS AFFICHÉ COMME UTILISABLE.
 *    L'avoir qui ne couvre pas l'heure se présente grisé, avec son solde — le
 *    serveur l'aurait refusé (`coach_apply_credit_payment` exige la couverture
 *    complète). L'annulation d'une séance à moins de 24 h disparaît au profit
 *    de l'explication.
 *
 * 4. LA CONFIRMATION EST DANS LA PAGE. `window.confirm` ouvrait une boîte grise
 *    du navigateur, hors charte, que les téléphones affichent en haut de
 *    l'écran loin du pouce. Elle est remplacée par un second temps, sur place :
 *    « Libérer ? Oui / Garder ma place ». Même garde-fou, même geste.
 */

type Confirmer = null | 'liberer' | 'annuler';

export function ReservationActions({
  reservation,
  paiementsTest = false,
  paypalDisponible = false,
  optionEchue = false,
  noteEchue = true,
  maintenant,
  creditsCents = 0,
  reserverHref = '/clubs',
  club,
}: {
  reservation: Reservation
  paiementsTest?: boolean
  /** Vrai seulement si des clés PayPal sont configurées pour ce mode (réel ou test). */
  paypalDisponible?: boolean
  /** Option dont le délai de paiement est passé (calculé par le serveur). */
  optionEchue?: boolean
  /** Faux quand la page affiche déjà un message de retour qui dit la même chose. */
  noteEchue?: boolean
  /** L'heure du serveur au rendu (ms) : premier affichage identique des deux côtés. */
  maintenant: number
  /** Le solde d'avoir du coach, en centimes. */
  creditsCents?: number
  /** La page du club, pour reprendre une heure. */
  reserverHref?: string
  /** Le nom court du club (« Minimes »). */
  club: string
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'payplug' | 'paypal' | 'credit' | 'annuler'>(null);
  const [confirmer, setConfirmer] = useState<Confirmer>(null);
  const t = useMaintenant(maintenant);
  const r = reservation;

  // Le délai décidé par le serveur, puis suivi à la seconde ici : quand il
  // tombe, la fiche change d'état sans attendre un rechargement.
  const echeance = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() : null;
  const echue =
    optionEchue || r.status === 'expired' || (r.status === 'held' && echeance !== null && t >= echeance);

  async function pay(provider: 'payplug' | 'paypal' | 'credit') {
    setBusy(provider);
    setError(null);
    try {
      const res = await checkoutReservation(r.id, provider);
      if (res.checkout_url && estUrlCheckoutSure(res.checkout_url)) {
        montrerChargement(provider === 'paypal' ? 'Ouverture de PayPal…' : 'Ouverture du paiement sécurisé…');
        window.location.href = res.checkout_url;
        return;
      }
      if (res.checkout_url) {
        setError('Le lien de paiement reçu n’est pas celui du prestataire : paiement bloqué par sécurité. Réessayez.');
        return;
      }
      montrerChargement('Ouverture de la signature…');
      router.push(`/espace-coach/reservations/${r.id}/signature`);
      router.refresh();
    } catch (err) {
      cacherChargement();
      setError(err instanceof ApiError ? err.message : 'Le paiement n’a pas pu démarrer. Vérifiez votre connexion et réessayez.');
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('annuler');
    setError(null);
    try {
      await cancelReservation(r.id);
      setConfirmer(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'L’annulation n’a pas abouti. Réessayez.');
    } finally {
      setBusy(null);
    }
  }

  const prix = formatCents(r.amount_cents);
  const debut = new Date(r.starts_at).getTime();
  const passee = new Date(r.ends_at).getTime() <= t;
  const limite = debut - REGLAGES_DEFAUT.cancel_min_hours * 3_600_000;
  const annulable = t < limite;
  const avoirSuffit = creditsCents >= r.amount_cents;
  const ouverture = r.qr_valid_from ? heure(r.qr_valid_from) : heure(debut - REGLAGES_DEFAUT.qr_early_minutes * 60_000);

  // Le parcours, recalculé avec l'échéance vue d'ici (pas seulement celle du serveur).
  const etats: [EtatEtape, EtatEtape, EtatEtape] = echue || r.status === 'payment_failed'
    ? ['rompu', 'avenir', 'avenir']
    : r.status === 'held'
      ? ['courant', 'avenir', 'avenir']
      : r.status === 'awaiting_signature'
        ? ['fait', 'courant', 'avenir']
        : r.status === 'confirmed'
          ? passee ? ['fait', 'fait', 'fait'] : ['fait', 'fait', 'courant']
          : r.status === 'consumed' || r.status === 'no_show'
            ? ['fait', 'fait', 'fait']
            : r.status === 'cancelled_credit'
              ? [r.payment_status === 'unpaid' ? 'rompu' : 'fait', r.signature_status === 'signed' ? 'fait' : 'rompu', 'rompu']
              : ['avenir', 'avenir', 'avenir'];

  const details: [string, string, string] = [
    etats[0] === 'fait'
      ? r.payment_status === 'waived_credit' ? 'Réglé par avoir' : `${prix} réglés`
      : etats[0] === 'rompu'
        ? r.status === 'payment_failed' ? 'Paiement refusé' : 'Délai écoulé'
        : echeance ? `Avant ${heure(echeance)}` : prix,
    etats[1] === 'fait' ? 'Documents signés' : etats[1] === 'courant' ? '3 documents, 2 minutes' : '3 documents',
    etats[2] === 'fait'
      ? r.status === 'no_show' ? 'Non honorée' : 'Séance passée'
      : etats[2] === 'courant' ? `Dès ${ouverture}` : `${REGLAGES_DEFAUT.qr_early_minutes} min avant`,
  ];

  return (
    <div className="ec-actions">
      <Parcours etats={etats} details={details} taille="grand" />

      {/* ── PLACE GARDÉE : PAYER ─────────────────────────────────────── */}
      {r.status === 'held' && !echue ? (
        <div className="ec-panneau" data-etat="payer">
          <div className="ec-garde">
            {r.hold_expires_at ? (
              <Cadran
                cible={r.hold_expires_at}
                maintenant={maintenant}
                echelle={REGLAGES_DEFAUT.hold_ttl_seconds * 1000}
                surtitre="Encore"
                legendeFin="Délai écoulé"
                taille="moyen"
                decision
                etiquette="Temps restant pour payer cette place"
              />
            ) : null}
            <div className="ec-garde__texte">
              <h2 className="ec-panneau__titre">Votre place est gardée</h2>
              <p>
                {r.hold_expires_at ? (
                  <>
                    Jusqu’à <b className="ec-mono">{heure(r.hold_expires_at)}</b>, elle n’est qu’à vous.
                    Passé ce délai, elle revient aux autres coachs — et rien n’aura été pris.
                  </>
                ) : (
                  'Elle n’est qu’à vous le temps de payer.'
                )}
              </p>
            </div>
          </div>

          <div className="ec-payer">
            <button
              type="button"
              className="btn ec-btn-cuivre ec-payer__principal"
              disabled={busy !== null}
              aria-busy={busy === 'payplug'}
              onClick={() => pay('payplug')}
            >
              <IcoCarte taille={20} />
              {busy === 'payplug' ? 'Ouverture du paiement…' : `Payer ${prix} par carte`}
              {paiementsTest ? <span className="ec-payer__test">essai</span> : null}
            </button>
            <p className="ec-payer__note">
              <IcoCadenas taille={15} />
              Paiement sécurisé chez Payplug. Vous revenez ici juste après, pour signer.
            </p>

            <p className="ec-payer__ou" aria-hidden="true">
              <span>ou</span>
            </p>

            <div className="ec-payer__autres">
              {/* Affiché seulement quand PayPal est configuré : un bouton qui mène à
                  « indisponible » n'a rien à faire devant un coach. */}
              {paypalDisponible ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy !== null}
                  aria-busy={busy === 'paypal'}
                  onClick={() => pay('paypal')}
                >
                  <IcoPaypal taille={19} />
                  {busy === 'paypal' ? 'Ouverture…' : 'PayPal'}
                  {paiementsTest ? <span className="ec-payer__test">essai</span> : null}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost ec-payer__avoir"
                disabled={busy !== null || !avoirSuffit}
                aria-busy={busy === 'credit'}
                aria-describedby="ec-avoir-solde"
                onClick={() => pay('credit')}
              >
                <IcoAvoir taille={19} />
                {busy === 'credit' ? 'Règlement…' : 'Mon avoir'}
              </button>
            </div>
            <p id="ec-avoir-solde" className="ec-payer__solde">
              {avoirSuffit
                ? `Avoir disponible : ${formatCents(creditsCents)}. Il règle cette heure en entier, sans passer par la banque.`
                : creditsCents > 0
                  ? `Votre avoir (${formatCents(creditsCents)}) ne couvre pas cette heure (${prix}).`
                  : 'Pas d’avoir pour l’instant : il se constitue quand vous annulez plus de 24 h avant une séance.'}
            </p>
          </div>

          <div className="ec-quitter">
            {confirmer === 'liberer' ? (
              <div className="ec-confirmer" role="group" aria-label="Confirmer la libération">
                <p>
                  <b>Libérer ce créneau ?</b> La place redevient disponible pour les autres coachs.
                </p>
                <div className="ec-confirmer__boutons">
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmer(null)} disabled={busy !== null}>
                    Garder ma place
                  </button>
                  <button type="button" className="btn ec-btn-encre" onClick={cancel} disabled={busy !== null} aria-busy={busy === 'annuler'}>
                    {busy === 'annuler' ? 'Libération…' : 'Oui, libérer'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="ec-quitter__lien" disabled={busy !== null} onClick={() => setConfirmer('liberer')}>
                Libérer ce créneau
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* ── DÉLAI ÉCOULÉ / PAIEMENT REFUSÉ ───────────────────────────── */}
      {echue || r.status === 'payment_failed' ? (
        <div className="ec-panneau ec-panneau--fin" data-etat="echue" role="status">
          <span className="ec-panneau__icone" aria-hidden="true">
            <IcoAlerte taille={22} />
          </span>
          <h2 className="ec-panneau__titre">
            {r.status === 'payment_failed' ? 'Le paiement n’a pas abouti' : 'Le délai pour payer est écoulé'}
          </h2>
          {noteEchue ? (
            <p>
              {r.status === 'payment_failed'
                ? 'Aucun paiement n’a été pris. L’heure est peut-être encore libre : reprenez-la en deux gestes.'
                : 'Cette place a été libérée et aucun paiement n’a été pris. D’autres heures vous attendent, dans ce club ou ailleurs.'}
            </p>
          ) : null}
          <div className="ec-panneau__boutons">
            <a className="btn ec-btn-encre" href={reserverHref}>
              Reprendre une heure à {club}
              <IcoFleche taille={17} />
            </a>
            <a className="ec-lien" href="/clubs">
              Voir les cinq clubs
            </a>
          </div>
        </div>
      ) : null}

      {/* ── PAYÉE : SIGNER ───────────────────────────────────────────── */}
      {r.status === 'awaiting_signature' ? (
        <div className="ec-panneau" data-etat="signer">
          <p className="ec-panneau__ok">
            <IcoCheck taille={18} />
            Paiement reçu
          </p>
          <h2 className="ec-panneau__titre">Dernière étape : signer, une seule fois</h2>
          <p>
            Les conditions générales, le règlement intérieur et la décharge : trois documents à lire et
            une signature au doigt, environ deux minutes. Votre QR d’accès s’affiche aussitôt après.
          </p>
          <a className="btn ec-btn-cuivre ec-panneau__geste" href={`/espace-coach/reservations/${r.id}/signature`}>
            <IcoStylo taille={19} />
            Signer les documents
          </a>
        </div>
      ) : null}

      {/* ── CONFIRMÉE : LE QR, ET L'ANNULATION EXPLIQUÉE ─────────────── */}
      {r.status === 'confirmed' && !passee ? (
        <div className="ec-panneau" data-etat="pret">
          <p className="ec-panneau__ok">
            <IcoCheck taille={18} />
            Tout est prêt
          </p>
          <h2 className="ec-panneau__titre">Votre QR ouvre la porte dès {ouverture}</h2>
          <p>
            Cinq minutes avant votre heure, présentez-le au lecteur de l’entrée. Il n’ouvre que Boxing
            Center {club}, et s’éteint à {heure(r.ends_at)}.
          </p>
          <a className="btn ec-btn-cuivre ec-panneau__geste ec-panneau__geste--qr" href={`/espace-coach/reservations/${r.id}/qr`}>
            <IcoQr taille={22} />
            Afficher mon QR d’accès
          </a>

          <div className="ec-annulation" data-annulable={annulable || undefined}>
            <h3>Un empêchement ?</h3>
            {annulable ? (
              <>
                <p>
                  Annulez jusqu’au <b>{jourLong(limite)} à {heure(limite)}</b> — encore{' '}
                  <b className="ec-mono">
                    <Decompte cible={new Date(limite).toISOString()} maintenant={maintenant} fin="0:00" />
                  </b>
                  . Les {prix} vous reviennent en avoir, utilisable dans les cinq clubs.
                </p>
                {confirmer === 'annuler' ? (
                  <div className="ec-confirmer" role="group" aria-label="Confirmer l’annulation">
                    <p>
                      <b>Annuler cette réservation ?</b> {prix} vous reviennent en avoir, tout de suite.
                    </p>
                    <div className="ec-confirmer__boutons">
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmer(null)} disabled={busy !== null}>
                        Garder ma séance
                      </button>
                      <button type="button" className="btn ec-btn-encre" onClick={cancel} disabled={busy !== null} aria-busy={busy === 'annuler'}>
                        {busy === 'annuler' ? 'Annulation…' : 'Oui, annuler'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="ec-quitter__lien" disabled={busy !== null} onClick={() => setConfirmer('annuler')}>
                    Annuler et recevoir un avoir
                  </button>
                )}
              </>
            ) : (
              <p>
                La séance commence dans moins de {REGLAGES_DEFAUT.cancel_min_hours} heures : elle ne peut plus
                être annulée, l’heure reste due. Pour un imprévu, prévenez Boxing Center au{' '}
                <a className="ec-lien" href={`tel:${RESEAU.telephone.e164}`}>
                  {RESEAU.telephone.affiche}
                </a>
                .
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── APRÈS : FAITE, ANNULÉE, NON HONORÉE ──────────────────────── */}
      {(r.status === 'confirmed' && passee) || r.status === 'consumed' || r.status === 'no_show' ? (
        <div className="ec-panneau ec-panneau--fin" data-etat="passee">
          <h2 className="ec-panneau__titre">
            {r.status === 'no_show' ? 'Séance non honorée' : 'Séance faite'}
          </h2>
          <p>{libelleStatut(r.status === 'confirmed' ? 'consumed' : r.status)}. Une prochaine heure, au même endroit ?</p>
          <div className="ec-panneau__boutons">
            <a className="btn ec-btn-encre" href={reserverHref}>
              Réserver à nouveau à {club}
              <IcoFleche taille={17} />
            </a>
          </div>
        </div>
      ) : null}

      {r.status === 'cancelled_credit' ? (
        <div className="ec-panneau ec-panneau--fin" data-etat="annulee">
          <span className="ec-panneau__icone" aria-hidden="true">
            <IcoAvoir taille={22} />
          </span>
          <h2 className="ec-panneau__titre">Annulée — {prix} rendus en avoir</h2>
          <p>
            L’avoir est déjà sur votre compte. Il se choisit au moment de payer votre prochaine heure, dans
            n’importe lequel des cinq clubs.
          </p>
          <div className="ec-panneau__boutons">
            <a className="btn ec-btn-encre" href={reserverHref}>
              Utiliser mon avoir à {club}
              <IcoFleche taille={17} />
            </a>
            <a className="ec-lien" href="/clubs">
              Un autre club
            </a>
          </div>
        </div>
      ) : null}

      <div role="alert" aria-live="assertive">
        {error ? <p className="form-error ec-erreur">{error}</p> : null}
      </div>
    </div>
  );
}
