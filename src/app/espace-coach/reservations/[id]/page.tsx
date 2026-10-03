import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { COPY_CLUBS } from '@/lib/clubs';
import { formatCents } from '@/lib/api/client';
import { libelleEspace, libelleMoyen, libellePaiement, retourPaiement } from '@/lib/libelles-coach';
import { ReservationActions } from './ReservationActions'
import { studioActif } from '@/lib/studio/session';
import { paypalActif } from '@/lib/payments/paypal';
import { synchroniserPaiementPayplug } from '@/lib/payments/payplug-sync';
import { estClubId } from '@/domain/contrat';
import {
  adresseClub,
  cheminReserverClub,
  clubCourt,
  libelleTarif,
  lienItineraire,
} from '@/components/espace-coach/parcours';
import { guichet, jourLong, plage } from '@/components/espace-coach/temps';
import { AjouterAgenda } from '@/components/espace-coach/AjouterAgenda';
import { IcoExterne, IcoItineraire, IcoMoyen, IcoRetour } from '@/components/espace-coach/Icones';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paiement?: string; annule?: string; cancelled?: string }>;
};

export const metadata: Metadata = { title: 'Réservation' };

/*
 * LA FICHE D'UNE RÉSERVATION.
 *
 * Elle affichait le nom du club, un prix « fixé au moment de la réservation »,
 * une ligne de statut et quatre boutons de même poids empilés — payer par
 * carte, PayPal, avoir, et « Libérer ce créneau » au même niveau que payer.
 *
 * Elle s'organise maintenant comme un billet :
 *
 *   — en tête, le guichet de date (le même que dans la liste : on reconnaît
 *     la carte sur laquelle on vient de toucher) et le club ;
 *   — à gauche, le parcours Payer → Signer → Accès QR, puis LE geste du
 *     moment, avec sa hiérarchie (carte d'abord, le reste ensuite, libérer
 *     en discret) ;
 *   — à droite, le récapitulatif : où, quand, combien, comment s'y rendre.
 *
 * Toute la logique de paiement est INCHANGÉE : la synchronisation Payplug au
 * retour, les redirections vers la signature, l'option échue décidée à l'heure
 * du serveur. On a changé ce qu'on voit, pas ce qui se passe.
 */
export default async function ReservationPage(ctx: Props) {
  const params = await ctx.params;
  const query = await ctx.searchParams;
  const retour = retourPaiement(query);
  const me = await getSessionMe();
  if (!me) redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}`);
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  const req = contextePage(`/espace-coach/reservations/${params.id}`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();

  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  let reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>)

  // Retour Payplug (ou rechargement tant que le webhook TEST n'est pas passé) :
  // on re-lit le paiement chez Payplug, puis on envoie le coach à la signature.
  if (reservation.status === 'held' && reservation.payment_status === 'unpaid') {
    const verdict = await synchroniserPaiementPayplug(params.id)
    if (verdict === 'ok' || verdict === 'replay') {
      redirect(`/espace-coach/reservations/${params.id}/signature`)
    }
    if (verdict === 'attente' && query.paiement === 'retour') {
      redirect(`/espace-coach/reservations/${params.id}?paiement=attente`)
    }
  }
  if (reservation.status === 'awaiting_signature' && query.paiement === 'retour') {
    redirect(`/espace-coach/reservations/${params.id}/signature`)
  }

  // Relecture si la sync a changé le statut sans redirect (cas rare).
  if (reservation.status === 'held') {
    const relire = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id)
    if (relire.ok) {
      reservation = versReservationPublique(relire.valeur as unknown as Record<string, unknown>)
    }
  }

  const paiementsTest = await studioActif();
  const paypalDisponible = paypalActif(paiementsTest);
  const maintenant = Date.now();
  // Une option dont le délai est passé n'est plus une place gardée, même si la
  // base ne l'a pas encore basculée en « expirée ». Décidé ici, à l'heure du
  // serveur — pas à celle du téléphone du coach.
  const optionEchue =
    reservation.status === 'held' &&
    Boolean(reservation.hold_expires_at) &&
    new Date(String(reservation.hold_expires_at)).getTime() <= maintenant;

  const r = reservation;
  const g = guichet(r.starts_at);
  const adresse = adresseClub(r.club_id);
  const club = clubCourt(r.club_id);
  const image = estClubId(r.club_id) ? COPY_CLUBS[r.club_id].hero_image : undefined;
  const paye = r.payment_status === 'paid' || r.payment_status === 'waived_credit';
  const actif = ['held', 'awaiting_signature', 'confirmed'].includes(r.status) && !optionEchue;

  return (
    <div className="ec-fiche">
      <section className="ec-fiche__tete" data-sans-scene aria-labelledby="ec-fiche-titre">
        <div className="ec-cadre">
          <Link className="ec-fil ec-entree" style={{ ['--d' as string]: 0 }} href="/espace-coach">
            <IcoRetour taille={17} />
            Mon espace
          </Link>
          <div className="ec-fiche__titre">
            <div className="ec-resa__guichet ec-guichet--grand ec-entree" style={{ ['--d' as string]: 1 }} aria-hidden="true">
              <span>{g.semaine}</span>
              <b>{g.jour}</b>
              <span>{g.mois}</span>
            </div>
            <div className="ec-entree" style={{ ['--d' as string]: 2 }}>
              <p className="ec-sur">Réservation · Espace {libelleEspace(r.space_id)}</p>
              <h1 id="ec-fiche-titre" className="ec-titre">
                {club}
              </h1>
              <p className="ec-fiche__quand">
                <span>{jourLong(r.starts_at)}</span>
                <span className="ec-mono">{plage(r.starts_at, r.ends_at)}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="ec-fiche__corps" data-sans-scene>
        <div className="ec-cadre ec-fiche__grille">
          <div className="ec-fiche__principal ec-entree" style={{ ['--d' as string]: 3 }}>
            {retour ? (
              <p className="note reservation-retour ec-retour" data-ton={retour.ton} role="status">
                {retour.texte}
              </p>
            ) : null}
            <ReservationActions
              reservation={reservation}
              paiementsTest={paiementsTest}
              paypalDisponible={paypalDisponible}
              optionEchue={optionEchue}
              noteEchue={!retour}
              maintenant={maintenant}
              creditsCents={me.credits_cents ?? 0}
              reserverHref={cheminReserverClub(r.club_id)}
              club={club}
            />
          </div>

          <aside className="ec-recap ec-entree" style={{ ['--d' as string]: 4 }} aria-label="Récapitulatif">
            {image ? (
              <div className="ec-recap__image">
                <Image src={image} alt="" fill sizes="(min-width: 1000px) 380px, 100vw" />
                <span className="ec-recap__club">{club}</span>
              </div>
            ) : null}
            <dl className="ec-recap__liste">
              <div>
                <dt>Adresse</dt>
                <dd>
                  {adresse ?? '—'}
                  {adresse ? (
                    <a className="ec-lien" href={lienItineraire(adresse)} target="_blank" rel="noopener">
                      <IcoItineraire taille={16} />
                      Itinéraire<span className="vh"> (Google Maps, nouvel onglet)</span>
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Espace</dt>
                <dd>{libelleEspace(r.space_id)}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{jourLong(r.starts_at)}</dd>
              </div>
              <div>
                <dt>Horaire</dt>
                <dd className="ec-mono">{plage(r.starts_at, r.ends_at)}</dd>
              </div>
              <div>
                <dt>Prix</dt>
                <dd>
                  <span className="ec-mono ec-recap__prix">{formatCents(r.amount_cents)}</span>
                  <small>{libelleTarif(r)} · prix fixé à la réservation</small>
                </dd>
              </div>
              <div>
                <dt>Paiement</dt>
                <dd className="ec-recap__paiement">
                  {paye ? (
                    <>
                      <IcoMoyen moyen={r.payment_status === 'waived_credit' ? 'credit' : r.payment_provider} taille={17} />
                      {r.payment_status === 'waived_credit'
                        ? 'Réglée par avoir'
                        : `${libellePaiement(r.payment_status)}${r.payment_provider ? ` · ${libelleMoyen(r.payment_provider)}` : ''}`}
                    </>
                  ) : (
                    libellePaiement(r.payment_status)
                  )}
                </dd>
              </div>
            </dl>
            {actif || r.signature_status === 'signed' ? (
              <div className="ec-recap__pied">
                {actif ? (
                  <AjouterAgenda
                    id={r.id}
                    debut={r.starts_at}
                    fin={r.ends_at}
                    titre={`Coaching — Boxing Center ${club}`}
                    lieu={adresse ?? `Boxing Center ${club}`}
                  />
                ) : null}
                {r.signature_status === 'signed' ? (
                  <a className="ec-lien" href={`/documents/attestation/${r.id}`} target="_blank" rel="noopener">
                    Attestation de signature (PDF)
                    <IcoExterne taille={15} />
                  </a>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
