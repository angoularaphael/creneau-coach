import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireQrPourMoi, lireReservation } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { lireUrlAccesBadge } from '@/lib/bot/acces-badge';
import { pngDepuisUrl } from '@/lib/qr-access';
import { libelleEspace } from '@/lib/libelles-coach';
import { decisionAffichageQr, fenetreQr } from '@/domain/qr-fenetre';
import { AjouterAgenda } from '@/components/espace-coach/AjouterAgenda';
import { adresseClub, clubCourt, lienItineraire } from '@/components/espace-coach/parcours';
import { heure, jourLong, plage } from '@/components/espace-coach/temps';
import { IcoCadenas, IcoItineraire, IcoPorte, IcoRetour, IcoSoleil } from '@/components/espace-coach/Icones';
import { AccesQr } from './AccesQr';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'QR d’accès' };

type Props = { params: Promise<{ id: string }> };

/*
 * L'ACCÈS — l'écran qu'on montre à la porte.
 *
 * Il affichait un QR de 280 px, et en dessous, tel quel : « Fenêtre :
 * 2026-10-03T07:55:00+00:00 au 2026-10-03T09:00:00+00:00 ». Des dates de base
 * de données, en UTC, à un coach debout devant un lecteur.
 *
 * Il dit maintenant, dans l'ordre où on en a besoin devant la porte :
 *   — avant l'heure : DANS COMBIEN DE TEMPS ça s'ouvre (le cadran), et le code
 *     arrive tout seul à l'ouverture, sans recharger ;
 *   — pendant : le code, en grand, sur blanc pur, l'écran maintenu allumé, et
 *     ce qui reste avant qu'il s'éteigne ;
 *   — l'adresse et l'itinéraire, pour le trajet d'avant.
 *
 * La génération et la sécurité du code sont INCHANGÉES : la fenêtre décidée par
 * `decisionAffichageQr`, l'adresse d'accès lue côté serveur, l'image fabriquée
 * côté serveur. Rien de secret n'arrive au navigateur avant l'heure.
 */
export default async function QrPage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) {
    redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}/qr`);
  }

  const req = contextePage(`/espace-coach/reservations/${params.id}/qr`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();

  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  const reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>);

  if (reservation.status !== 'confirmed') {
    redirect(`/espace-coach/reservations/${params.id}`);
  }

  const secret = await lireQrPourMoi(req, session.valeur.supabase, params.id);
  if (!secret.ok) notFound();

  const maintenant = Date.now();
  const accessUrl = await lireUrlAccesBadge(params.id).catch(() => null);
  const affichage = decisionAffichageQr(
    maintenant,
    secret.valeur.qr_valid_from,
    secret.valeur.qr_valid_to,
    accessUrl,
  );
  // « Refus » couvre deux cas que le coach doit distinguer : trop tôt (ça va
  // s'ouvrir) et trop tard (c'est fini). La fenêtre les sépare, sans rien
  // changer à la décision d'afficher ou non.
  const fenetre = fenetreQr(maintenant, secret.valeur.qr_valid_from, secret.valeur.qr_valid_to);

  let png = '';
  if (affichage === 'afficher' && accessUrl) {
    try {
      png = await pngDepuisUrl(accessUrl);
    } catch {
      png = '';
    }
  }

  const club = clubCourt(reservation.club_id);
  const adresse = adresseClub(reservation.club_id);
  const de = heure(secret.valeur.qr_valid_from);
  const a = heure(secret.valeur.qr_valid_to);

  return (
    <div className="ec-fiche ec-acces">
      <section className="ec-fiche__tete" data-sans-scene aria-labelledby="ec-acces-titre">
        <div className="ec-cadre">
          <Link className="ec-fil ec-entree" style={{ ['--d' as string]: 0 }} href={`/espace-coach/reservations/${params.id}`}>
            <IcoRetour taille={17} />
            Ma réservation
          </Link>
          <div className="ec-entree" style={{ ['--d' as string]: 1 }}>
            <p className="ec-sur">Étape 3 sur 3 · Accès</p>
            <h1 id="ec-acces-titre" className="ec-titre">
              Votre accès
            </h1>
            <p className="ec-fiche__quand">
              <span>
                <b>Boxing Center {club}</b> · espace {libelleEspace(reservation.space_id)}
              </span>
              <span>{jourLong(reservation.starts_at)}</span>
              <span className="ec-mono">{plage(reservation.starts_at, reservation.ends_at)}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="ec-fiche__corps" data-sans-scene>
        <div className="ec-cadre ec-acces__grille">
          <div className="ec-entree" style={{ ['--d' as string]: 2 }}>
            <AccesQr
              id={params.id}
              fenetre={fenetre}
              affichage={affichage}
              png={png}
              de={secret.valeur.qr_valid_from}
              a={secret.valeur.qr_valid_to}
              maintenant={maintenant}
              club={club}
            />
          </div>

          <aside className="ec-acces__infos ec-entree" style={{ ['--d' as string]: 3 }} aria-label="Bon à savoir">
            {adresse ? (
              <div className="ec-acces__adresse">
                <p className="ec-acces__label">Adresse</p>
                <p className="ec-acces__rue">{adresse}</p>
                <a className="btn btn-ghost" href={lienItineraire(adresse)} target="_blank" rel="noopener">
                  <IcoItineraire taille={18} />
                  Itinéraire<span className="vh"> vers Boxing Center {club} (Google Maps, nouvel onglet)</span>
                </a>
              </div>
            ) : null}
            <ul className="ec-conseils">
              <li>
                <IcoPorte taille={20} />
                <span>
                  Le code s’active à <b className="ec-mono">{de}</b> et s’éteint à <b className="ec-mono">{a}</b>.
                </span>
              </li>
              <li>
                <IcoCadenas taille={20} />
                <span>
                  Il n’ouvre que <b>Boxing Center {club}</b>, et seulement pour cette heure.
                </span>
              </li>
              <li>
                <IcoSoleil taille={20} />
                <span>
                  Montez la luminosité de l’écran au maximum : le lecteur le lit du premier coup.
                </span>
              </li>
            </ul>
            <div className="ec-acces__pied">
              <AjouterAgenda
                id={params.id}
                debut={reservation.starts_at}
                fin={reservation.ends_at}
                titre={`Coaching — Boxing Center ${club}`}
                lieu={adresse ?? `Boxing Center ${club}`}
              />
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
