import { libelleEspace, libelleMoyen, retourPaiement } from '@/lib/libelles-coach';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { Reservation } from '@/lib/api/types';
import { getSessionMe } from '@/lib/auth/session';
import { studioActif } from '@/lib/studio/session';
import { paypalActif } from '@/lib/payments/paypal';
import { signOutAction } from '@/app/auth/actions';
import { formatCents } from '@/lib/api/client';
import { listerReservations } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { COPY_CLUBS } from '@/lib/clubs';
import { CLUB_PAGES, cheminClub } from '@/lib/seo/routes';
import { CLUBS_VERITE } from '@/lib/seo/verite';
import { REGLAGES_DEFAUT, estClubId, prixCourt, type ClubId } from '@/domain/contrat';
import { Cadran, CadranFixe } from '@/components/espace-coach/Cadran';
import { Compteur } from '@/components/espace-coach/Compteur';
import { Decompte } from '@/components/espace-coach/Decompte';
import { Parcours, Pastille } from '@/components/espace-coach/ParcoursEtapes';
import {
  IcoAvoir,
  IcoCarte,
  IcoEnveloppe,
  IcoExterne,
  IcoFleche,
  IcoMoyen,
  IcoPlus,
  IcoQr,
  IcoSortie,
  IcoStylo,
} from '@/components/espace-coach/Icones';
import {
  adresseClub,
  cheminReserverClub,
  clubCourt,
  estAVenir,
  etapes,
  optionEchue,
  pastille,
  prochaineAction,
} from '@/components/espace-coach/parcours';
import {
  JOUR,
  dansCombien,
  dateCourte,
  ecartJours,
  guichet,
  heure,
  jourLong,
  jourMois,
  jourRelatif,
  moisAnnee,
  plage,
} from '@/components/espace-coach/temps';

export const metadata: Metadata = { title: 'Espace coach' };
export const dynamic = 'force-dynamic';

/*
 * LE TABLEAU DE BORD DU COACH.
 *
 * L'ancienne page tenait en un titre « Espace coach », une phrase de chiffres
 * collés (« Actives : 3 / 3 · avoir 10,00 € »), une grille de cartes toutes
 * identiques et des paiements en liste à puces. Tout y était, rien n'y était
 * LU : le coach devait ouvrir chaque carte pour savoir s'il avait quelque chose
 * à faire.
 *
 * Elle répond maintenant, dans l'ordre où il se les pose, à quatre questions :
 *
 *   1. Ai-je quelque chose à faire ?   → le bonjour dit combien, et lesquels.
 *   2. C'est quand, ma prochaine ?     → le cadran, et UN bouton : le prochain geste.
 *   3. Où j'en suis ?                  → places actives, avoir, séances faites.
 *   4. Je reprends une heure ?         → les cinq clubs, à un geste.
 *
 * Puis l'historique : à venir, passé, paiements. Et le compte, en pied.
 *
 * Le haut de page n'est PAS confié au moteur de défilement (`data-sans-scene`) :
 * il est déjà à l'écran, il ne peut pas « arriver au défilement ». Il a sa
 * propre entrée, au chargement, en cascade. Le reste se remplit au défilement
 * comme partout sur le site.
 */

const HOLD_MS = REGLAGES_DEFAUT.hold_ttl_seconds * 1000;

function trierParDebut(a: Reservation, b: Reservation) {
  return a.starts_at.localeCompare(b.starts_at);
}

export default async function CoachHomePage({
  searchParams,
}: {
  searchParams: Promise<{ paiement?: string }>
}) {
  const retour = retourPaiement(await searchParams);
  const me = await getSessionMe();
  if (!me) redirect('/auth/connexion?next=/espace-coach');
  if (me.status === 'suspended') redirect('/espace-coach/suspendu');

  if (me.email_verified === false) {
    return (
      <section className="ec-seuil" data-sans-scene aria-labelledby="ec-verif">
        <div className="ec-seuil__carte">
          <span className="ec-seuil__icone" aria-hidden="true">
            <IcoEnveloppe taille={26} />
          </span>
          <p className="ec-sur">Dernière vérification</p>
          <h1 id="ec-verif">Confirmez votre e-mail</h1>
          <p>
            Un lien de confirmation vient de partir vers{' '}
            <strong>{me.profile?.email ?? 'votre adresse'}</strong>. Un clic dessus, et votre
            espace s’ouvre : vous pourrez réserver votre première heure dans la foulée.
          </p>
          <p className="ec-seuil__aide">
            Rien reçu ? Regardez dans les indésirables, ou reconnectez-vous dans quelques minutes.
          </p>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-ghost">
              Se déconnecter
            </button>
          </form>
        </div>
      </section>
    );
  }

  const prenom = me.profile?.first_name?.trim() || '';
  const nomComplet =
    [me.profile?.first_name, me.profile?.last_name].filter(Boolean).join(' ') ||
    me.profile?.email ||
    'Coach';
  const initiales =
    [me.profile?.first_name, me.profile?.last_name]
      .map((s) => s?.trim()?.[0] ?? '')
      .join('')
      .toUpperCase() || 'BC';

  const ctx = contextePage('/espace-coach');
  const session = await exigerSession(ctx, { lectureSeule: true });
  const reservations = session.ok
    ? await listerReservations(ctx, session.valeur.supabase, { limit: 50 }, {
        clubId: null,
        coachId: session.valeur.acteur.id,
      }).then((r) =>
        r.ok
          ? r.valeur.items.map((row) =>
              versReservationPublique(row as unknown as Record<string, unknown>),
            )
          : [],
      )
    : [];

  // L'heure du serveur, une fois pour toute la page : chaque décompte part de
  // la même seconde, et le premier rendu est identique côté navigateur.
  const maintenant = Date.now();

  const aVenir = reservations.filter((r) => estAVenir(r, maintenant)).sort(trierParDebut);
  const passees = reservations
    .filter((r) => !estAVenir(r, maintenant))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const prochaine = aVenir[0] ?? null;
  const aFaire = aVenir.filter((r) => r.status === 'held' || r.status === 'awaiting_signature');

  // Trié ici, pas supposé : le titre promet « du plus récent au plus ancien »,
  // et l'ordre de l'API est celui des créneaux.
  const payments = reservations
    .filter((r) => r.payment_status === 'paid' || r.payment_status === 'waived_credit')
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const totalPaye = payments
    .filter((p) => p.payment_status === 'paid')
    .reduce((s, p) => s + p.amount_cents, 0);

  const actives = me.active_reservations_count ?? aVenir.length;
  const maxActives = me.max_active_reservations ?? REGLAGES_DEFAUT.max_active_reservations;
  const credits = me.credits_cents ?? 0;
  const heuresCreuses = Math.floor(credits / REGLAGES_DEFAUT.offpeak_cents);
  const heuresPleines = Math.floor(credits / REGLAGES_DEFAUT.peak_cents);

  const faites = reservations.filter((r) => r.status === 'consumed');
  const minutesFaites = faites.reduce(
    (s, r) => s + (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000,
    0,
  );
  const premiere = faites.map((r) => r.starts_at).sort()[0];
  // Les huit dernières semaines, de la plus ancienne à la plus récente : une
  // séance faite allume sa semaine. Une frise, pas un graphique — à ce volume,
  // un graphique mentirait par sa propre échelle.
  // Case 7 = les sept derniers jours ; case 0 = il y a sept à huit semaines.
  const semaines = Array.from({ length: 8 }, (_, k) => {
    const fin = maintenant - (7 - k) * 7 * JOUR;
    const debut = fin - 7 * JOUR;
    return faites.filter((r) => {
      const t = new Date(r.starts_at).getTime();
      return t >= debut && t < fin;
    }).length;
  });

  // Le club de la dernière réservation prise : le raccourci le plus probable.
  const dernierClub = [...reservations].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  )[0]?.club_id;

  const brief =
    aFaire.length > 1
      ? `${aFaire.length} réservations attendent un geste de votre part.`
      : aFaire.length === 1
        ? 'Une réservation attend un geste de votre part.'
        : prochaine
          ? `Votre prochaine séance est ${dansCombien(new Date(prochaine.starts_at).getTime() - maintenant)}, à ${clubCourt(prochaine.club_id)}. Tout est prêt.`
          : reservations.length
            ? 'Aucune séance prévue pour l’instant : votre prochaine heure se réserve en deux gestes.'
            : 'Bienvenue. Votre première heure se réserve en deux gestes, dans l’un des cinq clubs.';

  return (
    <div className="ec-tableau">
      {/* ── 1. LE BONJOUR, LE PROCHAIN GESTE, L'ÉTAT DU COMPTE ─────────── */}
      <section className="ec-accueil" data-sans-scene aria-labelledby="ec-bonjour">
        <div className="ec-cadre ec-accueil__tete">
          <div className="ec-accueil__texte">
            <p className="ec-sur ec-entree" style={{ ['--d' as string]: 0 }}>
              {jourLong(maintenant)} · Espace coach
            </p>
            <h1 id="ec-bonjour" className="ec-titre ec-entree" style={{ ['--d' as string]: 1 }}>
              Bonjour{prenom ? ` ${prenom}` : ''}
            </h1>
            <p className="ec-accueil__brief ec-entree" style={{ ['--d' as string]: 2 }}>
              {brief}
            </p>
            {aFaire.length ? (
              <ul className="ec-afaire ec-entree" style={{ ['--d' as string]: 3 }} aria-label="À faire">
                {aFaire.map((r) => (
                  <li key={r.id}>
                    {r.status === 'held' ? (
                      <Link className="ec-afaire__puce" href={`/espace-coach/reservations/${r.id}`}>
                        <IcoCarte taille={18} />
                        <span>
                          Payer <b>{clubCourt(r.club_id)}</b>
                        </span>
                        {r.hold_expires_at ? (
                          <span className="ec-afaire__reste" title="Temps restant pour payer">
                            <Decompte
                              cible={r.hold_expires_at}
                              maintenant={maintenant}
                              fin="délai écoulé"
                              rafraichir={r.id !== prochaine?.id}
                            />
                          </span>
                        ) : null}
                      </Link>
                    ) : (
                      <Link className="ec-afaire__puce" href={`/espace-coach/reservations/${r.id}/signature`}>
                        <IcoStylo taille={18} />
                        <span>
                          Signer <b>{clubCourt(r.club_id)}</b>
                        </span>
                        <span className="ec-afaire__reste">3 documents</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Link className="btn ec-btn-encre ec-accueil__reserver ec-entree" style={{ ['--d' as string]: 2 }} href="/clubs">
            <IcoPlus taille={18} />
            Réserver une heure
          </Link>
        </div>

        {retour ? (
          <div className="ec-cadre">
            <p className="note reservation-retour ec-retour" data-ton={retour.ton} role="status">
              {retour.texte}
            </p>
          </div>
        ) : null}

        <div className="ec-cadre">
          {prochaine ? (
            <Prochaine r={prochaine} maintenant={maintenant} />
          ) : (
            <Invitation
              premiere={reservations.length === 0}
              dernierClub={dernierClub && estClubId(dernierClub) ? dernierClub : null}
              paypal={paypalActif(await studioActif())}
            />
          )}
        </div>

        <div className="ec-cadre">
          <div className="ec-tuiles">
            {/* Les places actives : trois cases, une par réservation possible. */}
            <article className="ec-tuile ec-entree" style={{ ['--d' as string]: 5 }}>
              <h2 className="ec-tuile__titre">Réservations actives</h2>
              <p className="ec-tuile__valeur">
                <Compteur valeur={actives} />
                <span className="ec-tuile__sur">/ {maxActives}</span>
              </p>
              <ol className="ec-jauge" aria-label={`${actives} places occupées sur ${maxActives}`}>
                {Array.from({ length: maxActives }, (_, i) => {
                  const r = aVenir[i];
                  const plein = i < actives;
                  return (
                    <li key={i} data-plein={plein || undefined} style={{ ['--i' as string]: i }}>
                      <span>{plein ? (r ? clubCourt(r.club_id) : 'Occupée') : 'Libre'}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="ec-tuile__note">
                {actives >= maxActives
                  ? 'Limite atteinte : une place se libère dès qu’une séance est passée ou annulée.'
                  : maxActives - actives === 1
                    ? 'Encore une réservation possible en même temps.'
                    : `Encore ${maxActives - actives} réservations possibles en même temps.`}
              </p>
            </article>

            {/* L'avoir : ce qu'il vaut, en HEURES — c'est ainsi qu'un coach compte. */}
            <article className="ec-tuile ec-entree" style={{ ['--d' as string]: 6 }}>
              <h2 className="ec-tuile__titre">Avoir disponible</h2>
              <p className="ec-tuile__valeur">
                <Compteur valeur={credits} format="euros" />
              </p>
              <div className="ec-jetons" aria-hidden="true">
                {heuresCreuses > 0 ? (
                  <>
                    {Array.from({ length: Math.min(heuresCreuses, 6) }, (_, i) => (
                      <span key={i} className="ec-jeton" style={{ ['--i' as string]: i }}>
                        <IcoAvoir taille={22} />
                      </span>
                    ))}
                    {heuresCreuses > 6 ? <span className="ec-jetons__plus">+{heuresCreuses - 6}</span> : null}
                  </>
                ) : (
                  <span className="ec-jeton" data-vide>
                    <IcoAvoir taille={22} />
                  </span>
                )}
              </div>
              <p className="ec-tuile__note">
                {heuresCreuses > 0 ? (
                  <>
                    De quoi régler{' '}
                    <b>
                      {heuresCreuses} heure{heuresCreuses > 1 ? 's' : ''} creuse{heuresCreuses > 1 ? 's' : ''}
                    </b>
                    {heuresPleines > 0 ? (
                      <>
                        {' '}ou {heuresPleines} pleine{heuresPleines > 1 ? 's' : ''}
                      </>
                    ) : null}
                    , dans les cinq clubs. Il se choisit au moment de payer.
                  </>
                ) : (
                  <>
                    Annulez plus de {REGLAGES_DEFAUT.cancel_min_hours} h avant une séance : son montant
                    revient ici, à réutiliser dans n’importe quel club.
                  </>
                )}
              </p>
            </article>

            {/* Les séances faites, et la frise des huit dernières semaines. */}
            <article className="ec-tuile ec-entree" style={{ ['--d' as string]: 7 }}>
              <h2 className="ec-tuile__titre">Séances faites</h2>
              <p className="ec-tuile__valeur">
                <Compteur valeur={faites.length} />
              </p>
              <ol className="ec-frise" aria-label="Séances faites sur les huit dernières semaines">
                {semaines.map((n, i) => (
                  <li key={i} data-n={Math.min(n, 3)} style={{ ['--i' as string]: i }}>
                    <span className="vh">
                      {i === 7 ? 'Cette semaine' : `Il y a ${7 - i} semaine${7 - i > 1 ? 's' : ''}`} : {n} séance{n > 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="ec-tuile__note">
                {faites.length && premiere ? (
                  <>
                    {Math.round(minutesFaites / 60)} h de coaching depuis {moisAnnee(premiere)}.
                    <span className="ec-frise__legende" aria-hidden="true">
                      8 dernières semaines
                    </span>
                  </>
                ) : (
                  'Votre première séance faite s’allumera ici, semaine après semaine.'
                )}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 2. RÉSERVER : LES CINQ CLUBS, À UN GESTE ───────────────────── */}
      <section className="ec-bloc" data-sans-scene aria-labelledby="ec-clubs">
        <div className="ec-cadre">
          <header className="ec-bloc__tete ec-defile">
            <div>
              <h2 id="ec-clubs" className="ec-titre-bloc">
                Réserver une heure
              </h2>
              <p>
                Cinq clubs à Toulouse et autour : {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure creuse,{' '}
                {prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure pleine, sans abonnement.
              </p>
            </div>
            <Link className="ec-lien" href="/clubs">
              Comparer les clubs <IcoFleche taille={16} />
            </Link>
          </header>
          <ul className="ec-clubs">
            {CLUB_PAGES.map((c) => {
              const id = c.clubId;
              if (!estClubId(id)) return null;
              const v = CLUBS_VERITE[id];
              return (
                <li key={c.slug} className="ec-club ec-defile" data-dernier={dernierClub === id || undefined} style={{ ['--i' as string]: CLUB_PAGES.indexOf(c) }}>
                  <Link href={cheminClub(c.slug)} className="ec-club__lien">
                    <span className="ec-club__image">
                      {dernierClub === id ? <span className="ec-club__marque">Votre dernier club</span> : null}
                      <Image
                        src={COPY_CLUBS[id].hero_image ?? '/visuels/hero-clubs.webp'}
                        alt=""
                        fill
                        sizes="(min-width: 1000px) 220px, (min-width: 640px) 40vw, 72vw"
                      />
                    </span>
                    <span className="ec-club__texte">
                      <span className="ec-club__nom">{clubCourt(id)}</span>
                      <span className="ec-club__ville">{v.ville}</span>
                      <span className="ec-club__equipement">{v.equipement.resume}</span>
                      <span className="ec-club__cta">
                        Voir les heures libres <IcoFleche taille={15} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── 3. LES RÉSERVATIONS : À VENIR, PUIS L'HISTORIQUE ──────────── */}
      <section className="ec-bloc" data-sans-scene aria-labelledby="ec-resas">
        <div className="ec-cadre">
          <header className="ec-bloc__tete ec-defile">
            <div>
              <h2 id="ec-resas" className="ec-titre-bloc">
                Mes réservations
              </h2>
              <p>Chaque réservation affiche son prochain geste. Un seul : celui qui compte maintenant.</p>
            </div>
          </header>
          <div className="ec-resas">
            <div className="ec-resas__avenir ec-defile">
              <h3 className="ec-resas__titre">
                À venir <span className="ec-nombre">{aVenir.length}</span>
              </h3>
              {aVenir.length === 0 ? (
                <div className="ec-vide">
                  <p>
                    <b>Rien de prévu pour l’instant.</b> Choisissez un club, une heure libre, et elle
                    apparaît ici avec son décompte.
                  </p>
                  <Link className="btn btn-ghost" href="/clubs">
                    Voir les heures libres
                  </Link>
                </div>
              ) : (
                <Jours reservations={aVenir} maintenant={maintenant} />
              )}
            </div>

            <div className="ec-resas__passees ec-defile">
              <h3 className="ec-resas__titre">
                Passées et annulées <span className="ec-nombre">{passees.length}</span>
              </h3>
              {passees.length === 0 ? (
                <p className="ec-vide ec-vide--discret">Vos séances passées s’archiveront ici, avec leur attestation.</p>
              ) : (
                <ul className="ec-passees">
                  {passees.map((r) => {
                    const p = pastille(r, maintenant);
                    const a = prochaineAction(r, maintenant);
                    return (
                      <li key={r.id} className="ec-passee">
                        <span className="ec-passee__date ec-mono">{dateCourte(r.starts_at).slice(0, 5)}</span>
                        <span className="ec-passee__corps">
                          <Link href={`/espace-coach/reservations/${r.id}`} className="ec-passee__club ec-etire">
                            {clubCourt(r.club_id)}
                          </Link>
                          <span className="ec-passee__meta ec-mono">
                            {plage(r.starts_at, r.ends_at)} · {formatCents(r.amount_cents)}
                          </span>
                        </span>
                        <Pastille ton={p.ton}>{p.texte}</Pastille>
                        {a ? (
                          <Link
                            className="ec-passee__action"
                            href={a.href}
                            {...(a.nouvelOnglet ? { target: '_blank', rel: 'noopener' } : {})}
                          >
                            {a.libelle}
                            {a.nouvelOnglet ? <IcoExterne taille={14} /> : <IcoFleche taille={14} />}
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. LES PAIEMENTS : UN VRAI RELEVÉ ──────────────────────────── */}
      <section className="ec-bloc" data-sans-scene aria-labelledby="ec-paiements">
        <div className="ec-cadre">
          <header className="ec-bloc__tete ec-defile">
            <div>
              <h2 id="ec-paiements" className="ec-titre-bloc">
                Paiements
              </h2>
              <p>Du plus récent au plus ancien. L’attestation de signature se télécharge ligne par ligne.</p>
            </div>
            {payments.length ? (
              <p className="ec-total">
                <span>Total réglé</span>
                <b className="ec-mono">{formatCents(totalPaye)}</b>
              </p>
            ) : null}
          </header>
          {payments.length === 0 ? (
            <p className="ec-vide ec-vide--discret">
              Aucun paiement pour l’instant. Chaque heure réglée — par carte, PayPal ou avoir — s’inscrira ici.
            </p>
          ) : (
            <div className="ec-releve ec-defile">
              <table className="ec-table">
                <caption className="vh">Historique de vos paiements, du plus récent au plus ancien</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Séance</th>
                    <th scope="col">Moyen</th>
                    <th scope="col" className="ec-table__num">
                      Montant
                    </th>
                    <th scope="col">
                      <span className="vh">Justificatif</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} data-avoir={p.payment_status === 'waived_credit' || undefined}>
                      <td className="ec-mono ec-table__date" data-label="Date">
                        {p.created_at ? (
                          <>
                            {dateCourte(p.created_at)}
                            <small>{heure(p.created_at)}</small>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td data-label="Séance" className="ec-table__seance">
                        <b>{clubCourt(p.club_id)}</b>
                        <small>
                          {jourLong(p.starts_at)} · {heure(p.starts_at)}
                          {p.status === 'cancelled_credit' ? ' · rendu en avoir' : ''}
                        </small>
                      </td>
                      <td data-label="Moyen" className="ec-table__moyen">
                        <IcoMoyen moyen={p.payment_status === 'waived_credit' ? 'credit' : p.payment_provider} taille={18} />
                        {p.payment_status === 'waived_credit'
                          ? 'Avoir'
                          : libelleMoyen(p.payment_provider) || 'Carte bancaire'}
                      </td>
                      <td data-label="Montant" className="ec-table__num ec-mono">
                        {formatCents(p.amount_cents)}
                      </td>
                      <td className="ec-table__doc">
                        {p.signature_status === 'signed' ? (
                          <a href={`/documents/attestation/${p.id}`} target="_blank" rel="noopener" className="ec-lien">
                            Attestation<span className="vh"> de signature, {clubCourt(p.club_id)} (PDF, nouvel onglet)</span>
                            <IcoExterne taille={14} />
                          </a>
                        ) : (
                          <span className="ec-table__attente">{p.status === 'awaiting_signature' ? 'À signer' : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. LE COMPTE ─────────────────────────────────────────────────── */}
      <section className="ec-bloc ec-bloc--pied" data-sans-scene aria-label="Mon compte">
        <div className="ec-cadre">
          <div className="ec-compte ec-defile">
            <div className="ec-compte__qui">
              <span className="ec-monogramme" aria-hidden="true">
                {initiales}
              </span>
              <div>
                <p className="ec-compte__nom">{nomComplet}</p>
                {me.profile?.email ? <p className="ec-compte__mail">{me.profile.email}</p> : null}
              </div>
            </div>
            <div className="ec-compte__actions">
              <Link className="btn btn-ghost" href="/espace-coach/profil">
                Mon profil
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="btn ec-btn-discret">
                  <IcoSortie taille={17} />
                  Se déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────
   LA PROCHAINE SÉANCE — le seul bloc en encre de la page.

   Sur un tableau de bord clair, l'encre Boxing Center attire l'œil avant tout
   le reste : c'est voulu, c'est LA chose à savoir. Le bouton y est le seul
   aplat cuivré de l'écran (la loi du brun : ce qui se décide, et rien d'autre).
   ─────────────────────────────────────────────────────────────────────── */
function Prochaine({ r, maintenant }: { r: Reservation; maintenant: number }) {
  const p = pastille(r, maintenant);
  const fiche = `/espace-coach/reservations/${r.id}`;
  const adresse = adresseClub(r.club_id);
  const debut = new Date(r.starts_at).getTime();
  const enCours = debut <= maintenant;
  const relatif = jourRelatif(r.starts_at, maintenant);
  const ecart = ecartJours(r.starts_at, maintenant);

  const action =
    r.status === 'held'
      ? { href: fiche, texte: `Payer ${formatCents(r.amount_cents)}`, Icone: IcoCarte }
      : r.status === 'awaiting_signature'
        ? { href: `${fiche}/signature`, texte: 'Signer mes documents', Icone: IcoStylo }
        : { href: `${fiche}/qr`, texte: 'Afficher mon QR d’accès', Icone: IcoQr };

  return (
    <article className="ec-prochaine ec-entree" style={{ ['--d' as string]: 4 }} aria-labelledby="ec-prochaine-titre">
      <div className="ec-prochaine__texte">
        <p className="ec-prochaine__sur">
          <span>Prochaine séance</span>
          <Pastille ton={p.ton}>{p.texte}</Pastille>
        </p>
        <h2 id="ec-prochaine-titre" className="ec-prochaine__jour">
          {relatif}
          {ecart >= 0 && ecart < 2 ? <span>{jourLong(r.starts_at)}</span> : null}
          {ecart >= 2 && ecart < 7 ? <span>{jourMois(r.starts_at)}</span> : null}
        </h2>
        <p className="ec-prochaine__heure ec-mono">
          {heure(r.starts_at)}
          <span aria-hidden="true">—</span>
          <span className="vh"> à </span>
          {heure(r.ends_at)}
        </p>
        <p className="ec-prochaine__lieu">
          <b>{clubCourt(r.club_id)}</b> · Espace {libelleEspace(r.space_id)}
          {adresse ? <span>{adresse}</span> : null}
        </p>
        <Parcours etats={etapes(r, maintenant)} />
        <div className="ec-prochaine__actions">
          <Link className="btn ec-btn-cuivre" href={action.href}>
            <action.Icone taille={19} />
            {action.texte}
          </Link>
          <Link className="ec-prochaine__detail" href={fiche}>
            Détail de la réservation <IcoFleche taille={16} />
          </Link>
        </div>
      </div>
      <div className="ec-prochaine__cadran">
        {r.status === 'held' && r.hold_expires_at ? (
          <Cadran
            cible={r.hold_expires_at}
            maintenant={maintenant}
            echelle={HOLD_MS}
            surtitre="Place gardée"
            legende="pour payer"
            legendeFin="Place libérée"
            ton="nuit"
            decision
            rafraichir
            etiquette="Temps restant pour payer cette place"
          />
        ) : enCours ? (
          <Cadran
            cible={r.ends_at}
            maintenant={maintenant}
            echelle={new Date(r.ends_at).getTime() - debut}
            surtitre="En cours"
            legende="avant la fin"
            legendeFin="Séance terminée"
            ton="nuit"
            rafraichir
            etiquette="Temps restant dans la séance"
          />
        ) : (
          <Cadran
            cible={r.starts_at}
            maintenant={maintenant}
            surtitre="Dans"
            legende="avant la séance"
            ton="nuit"
            rafraichir
            etiquette="Temps restant avant la séance"
          />
        )}
      </div>
    </article>
  );
}

/* Pas de séance à venir : la carte d'encre devient une invitation, jamais un vide. */
function Invitation({
  premiere,
  dernierClub,
  paypal,
}: {
  premiere: boolean;
  dernierClub: ClubId | null;
  /** PayPal n'est cité que s'il est réellement proposé au paiement. */
  paypal: boolean;
}) {
  return (
    <article className="ec-prochaine ec-prochaine--invitation ec-entree" style={{ ['--d' as string]: 4 }} aria-labelledby="ec-invitation">
      <div className="ec-prochaine__texte">
        <p className="ec-prochaine__sur">
          <span>{premiere ? 'Pour commencer' : 'Prochaine séance'}</span>
        </p>
        <h2 id="ec-invitation" className="ec-prochaine__jour">
          {premiere ? 'Votre première heure, en trois gestes' : 'Votre prochaine heure vous attend'}
        </h2>
        <ol className="ec-trois">
          <li>
            <b>Choisissez un club et une heure.</b>
            <span>
              {prixCourt(REGLAGES_DEFAUT.offpeak_cents)} l’heure creuse, {prixCourt(REGLAGES_DEFAUT.peak_cents)} l’heure pleine.
              La place vous est gardée {REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes.
            </span>
          </li>
          <li>
            <b>Payez, puis signez une fois.</b>
            <span>
              {paypal ? 'Carte, PayPal ou avoir.' : 'Carte ou avoir.'} Trois documents, deux minutes, au doigt.
            </span>
          </li>
          <li>
            <b>Entrez avec votre QR.</b>
            <span>Il ouvre la porte du club {REGLAGES_DEFAUT.qr_early_minutes} minutes avant votre heure.</span>
          </li>
        </ol>
        <div className="ec-prochaine__actions">
          {dernierClub ? (
            <Link className="btn ec-btn-cuivre" href={cheminReserverClub(dernierClub)}>
              <IcoPlus taille={19} />
              Réserver à {clubCourt(dernierClub)}
            </Link>
          ) : (
            <Link className="btn ec-btn-cuivre" href="/clubs">
              <IcoPlus taille={19} />
              {premiere ? 'Choisir mon premier créneau' : 'Choisir un créneau'}
            </Link>
          )}
          {dernierClub ? (
            <Link className="ec-prochaine__detail" href="/clubs">
              Voir les cinq clubs <IcoFleche taille={16} />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="ec-prochaine__cadran">
        <CadranFixe haut="1 heure" chiffre="60" unite="min" bas="à vous seul" ton="nuit" />
      </div>
    </article>
  );
}

/* La liste « à venir », regroupée par jour : « Demain », « Mardi »… */
function Jours({ reservations, maintenant }: { reservations: Reservation[]; maintenant: number }) {
  const groupes = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const cle = jourRelatif(r.starts_at, maintenant);
    groupes.set(cle, [...(groupes.get(cle) ?? []), r]);
  }
  return (
    <div className="ec-jours">
      {[...groupes.entries()].map(([jour, liste]) => (
        <div key={jour} className="ec-jour">
          <p className="ec-jour__nom">
            {jour}
            {ecartJours(liste[0]!.starts_at, maintenant) < 2 ? <span>{jourLong(liste[0]!.starts_at)}</span> : null}
            {ecartJours(liste[0]!.starts_at, maintenant) >= 2 && ecartJours(liste[0]!.starts_at, maintenant) < 7 ? (
              <span>{jourMois(liste[0]!.starts_at)}</span>
            ) : null}
          </p>
          {liste.map((r) => (
            <CarteResa key={r.id} r={r} maintenant={maintenant} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CarteResa({ r, maintenant }: { r: Reservation; maintenant: number }) {
  const g = guichet(r.starts_at);
  const p = pastille(r, maintenant);
  const a = prochaineAction(r, maintenant);
  return (
    <article className="ec-resa" data-ton={p.ton}>
      <div className="ec-resa__guichet" aria-hidden="true">
        <span>{g.semaine}</span>
        <b>{g.jour}</b>
        <span>{g.mois}</span>
      </div>
      <div className="ec-resa__corps">
        <h4 className="ec-resa__club">
          <Link href={`/espace-coach/reservations/${r.id}`} className="ec-etire">
            {clubCourt(r.club_id)}
            <span className="vh">, {jourLong(r.starts_at)}</span>
          </Link>
        </h4>
        <p className="ec-resa__meta">
          <span className="ec-mono">{plage(r.starts_at, r.ends_at)}</span>
          <span>Espace {libelleEspace(r.space_id)}</span>
          <span className="ec-mono">{formatCents(r.amount_cents)}</span>
        </p>
        <Parcours etats={etapes(r, maintenant)} />
      </div>
      <div className="ec-resa__droite">
        <Pastille ton={p.ton}>{p.texte}</Pastille>
        {r.status === 'held' && r.hold_expires_at && !optionEchue(r, maintenant) ? (
          <span className="ec-resa__garde">
            gardée encore <Decompte cible={r.hold_expires_at} maintenant={maintenant} fin="0:00" />
          </span>
        ) : null}
        {a ? (
          <Link className="ec-resa__action" data-ton={a.ton} href={a.href}>
            {a.libelle}
            <IcoFleche taille={15} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
