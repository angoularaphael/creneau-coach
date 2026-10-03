import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionMe } from '@/lib/auth/session';
import { lireReservation, listerDocumentsCourants } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { formatCents } from '@/lib/api/client';
import { libelleEspace } from '@/lib/libelles-coach';
import { PAGES, cheminPublic, estTypeDocument } from '@/lib/documents/obligatoires';
import { RESEAU } from '@/lib/seo/verite';
import { Parcours } from '@/components/espace-coach/ParcoursEtapes';
import { clubCourt } from '@/components/espace-coach/parcours';
import { jourLong, plage } from '@/components/espace-coach/temps';
import { IcoRetour, IcoTelephone } from '@/components/espace-coach/Icones';
import { ListeDocuments, SignaturePad, type DocASigner } from './SignaturePad';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Signer vos documents' };

type Props = { params: Promise<{ id: string }> };

/**
 * SIGNER — la dernière étape avant l'accès (cahier §13, étape 9, et §16).
 *
 * La page affichait « Documents à signer après paiement / avoir », un pad, et
 * une case « Je consens à signer CGV, RI et décharge » — sans jamais montrer
 * les documents. On faisait signer des textes que le coach ne pouvait pas lire,
 * et qui, vérification faite, n'existaient nulle part. Elle affichait aussi, à
 * un coach, « hash SHA-256 » et « awaiting_signature → confirmed ».
 *
 * Désormais : ce qu'il réserve, les trois documents avec un lien pour les lire,
 * puis la signature. Si un document n'est pas encore publié, on ne propose pas
 * de signer du vide — on le dit, et on dit que sa place et son paiement sont
 * gardés.
 *
 * ── LE CALME, PARCE QUE C'EST UN ENGAGEMENT ──────────────────────────────
 * Une page qui fait signer doit rassurer, pas presser : aucun décompte ici,
 * aucun cuivre ailleurs que sur le bouton final. À gauche ce qu'on signe, à
 * droite où l'on signe. Le parcours en haut dit « avant-dernière minute » :
 * le paiement est fait, l'accès est juste après.
 */
export default async function SignaturePage(ctx: Props) {
  const params = await ctx.params;
  const me = await getSessionMe();
  if (!me) {
    redirect(`/auth/connexion?next=/espace-coach/reservations/${params.id}/signature`);
  }

  const req = contextePage(`/espace-coach/reservations/${params.id}/signature`);
  const session = await exigerSession(req, { lectureSeule: true });
  if (!session.ok) notFound();
  const lecture = await lireReservation(req, session.valeur.supabase, session.valeur.acteur, params.id);
  if (!lecture.ok) notFound();
  const reservation = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>);

  if (reservation.status === 'confirmed') {
    redirect(`/espace-coach/reservations/${params.id}/qr`);
  }
  if (reservation.status !== 'awaiting_signature') {
    redirect(`/espace-coach/reservations/${params.id}`);
  }

  const docs = await listerDocumentsCourants(req, session.valeur.supabase);
  const documents = docs.ok ? docs.valeur : [];
  const manquants = documents.filter((d) => !d.file_sha256);
  const pret = documents.length >= 3 && manquants.length === 0;

  // Ce que la liste montre de chaque document. La version d'un document non
  // publié n'est pas une version : c'est une ligne d'attente, elle ne s'affiche
  // qu'une fois le fichier en ligne.
  const aLire: DocASigner[] = documents.map((d) => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    version: d.file_sha256 ? String(d.version) : null,
    // La page d'abord : au téléphone, un PDF se lit mal. Le PDF reste à côté —
    // c'est la version qui fait foi.
    page: d.file_sha256 && estTypeDocument(d.kind) ? PAGES[d.kind] : null,
    pdf: d.file_sha256 && estTypeDocument(d.kind) ? cheminPublic(d.kind) : null,
  }));

  const club = clubCourt(reservation.club_id);
  const nomSuggere = [me.profile?.first_name, me.profile?.last_name].filter(Boolean).join(' ');

  return (
    <div className="ec-fiche ec-signature">
      <section className="ec-fiche__tete" data-sans-scene aria-labelledby="ec-signer-titre">
        <div className="ec-cadre">
          <Link className="ec-fil ec-entree" style={{ ['--d' as string]: 0 }} href={`/espace-coach/reservations/${params.id}`}>
            <IcoRetour taille={17} />
            Ma réservation
          </Link>
          <div className="ec-entree" style={{ ['--d' as string]: 1 }}>
            <p className="ec-sur">Étape 2 sur 3 · Signature</p>
            <h1 id="ec-signer-titre" className="ec-titre">
              Une signature, et c’est prêt
            </h1>
            <p className="ec-signature__sous">
              Votre paiement de <b>{formatCents(reservation.amount_cents)}</b> est enregistré. Il ne reste
              qu’à signer pour recevoir votre accès : <b>{club}</b>, espace {libelleEspace(reservation.space_id)},{' '}
              {jourLong(reservation.starts_at)}, <span className="ec-mono">{plage(reservation.starts_at, reservation.ends_at)}</span>.
            </p>
          </div>
        </div>
      </section>

      <section className="ec-fiche__corps" data-sans-scene>
        <div className="ec-cadre">
          <div className="ec-entree" style={{ ['--d' as string]: 2 }}>
            <Parcours
              etats={['fait', 'courant', 'avenir']}
              details={['Paiement reçu', '3 documents, 2 minutes', 'Juste après']}
              taille="grand"
            />
          </div>

          {pret ? (
            <SignaturePad
              reservationId={params.id}
              documents={aLire}
              nomSuggere={nomSuggere}
            />
          ) : (
            <div className="ec-signature__grille">
              <div className="ec-entree" style={{ ['--d' as string]: 3 }}>
                <ListeDocuments documents={aLire} />
              </div>
              <div className="ec-panneau ec-entree" role="status" style={{ ['--d' as string]: 4 }}>
                <h2 className="ec-panneau__titre">Les documents arrivent</h2>
                <p>
                  <b>Boxing Center finalise leur publication.</b> Vous ne pouvez pas signer un texte que
                  vous ne pouvez pas lire : la signature s’ouvrira dès qu’ils seront en ligne. Votre place
                  et votre paiement sont conservés.
                </p>
                <a className="btn btn-ghost" href={`tel:${RESEAU.telephone.e164}`}>
                  <IcoTelephone taille={18} />
                  Une question : {RESEAU.telephone.affiche}
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
