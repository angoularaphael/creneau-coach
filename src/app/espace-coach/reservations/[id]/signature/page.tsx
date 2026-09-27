import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FUSEAU_METIER } from '@/domain/contrat';
import { getSessionMe } from '@/lib/auth/session';
import { nomClub } from '@/lib/clubs';
import { lireReservation, listerDocumentsCourants } from '@/lib/dal/reservations';
import { versReservationPublique } from '@/lib/dal/map';
import { exigerSession } from '@/lib/dal/acteur';
import { contextePage } from '@/lib/dal/page';
import { cheminPublic, estTypeDocument } from '@/lib/documents/obligatoires';
import { RESEAU } from '@/lib/seo/verite';
import { SignaturePad } from './SignaturePad';

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

  const jour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_METIER,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(reservation.starts_at));
  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_METIER, hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );

  return (
    <>
      <header className="page-hero">
        <p className="muted">
          <Link href={`/espace-coach/reservations/${params.id}`}>Retour à la réservation</Link>
        </p>
        <h1>Signer vos documents</h1>
        <p className="page-hero__sous">
          Votre paiement est enregistré. Dernière étape avant votre accès :{' '}
          {nomClub(reservation.club_id)}, {jour}, de {heure(reservation.starts_at)} à{' '}
          {heure(reservation.ends_at)}.
        </p>
      </header>

      <section className="section signature">
        <div className="enveloppe signature__corps">
          <h2 id="documents-titre">1. Lisez les documents</h2>
          <ul className="signature__docs" aria-labelledby="documents-titre">
            {documents.map((d) => (
              <li key={d.id} className="signature__doc" data-publie={Boolean(d.file_sha256)}>
                <span className="signature__doc-titre">{d.title}</span>
                {/* La version d'un document non publié n'est pas une version : c'est
                    une ligne d'attente. On ne l'affiche qu'une fois le fichier en ligne. */}
                {d.file_sha256 ? <span className="signature__doc-version">Version {d.version}</span> : null}
                {d.file_sha256 && estTypeDocument(d.kind) ? (
                  <a
                    className="btn btn-ghost signature__lire"
                    href={cheminPublic(d.kind)}
                    target="_blank"
                    rel="noopener"
                  >
                    Lire<span className="vh"> : {d.title} (PDF, nouvel onglet)</span>
                  </a>
                ) : (
                  <span className="signature__attente">En cours de publication</span>
                )}
              </li>
            ))}
          </ul>

          {pret ? (
            <>
              <h2>2. Signez</h2>
              <SignaturePad
                reservationId={params.id}
                documents={documents.map((d) => ({ id: d.id, kind: d.kind, title: d.title }))}
              />
            </>
          ) : (
            <div className="note" role="status">
              <p>
                <b>Boxing Center finalise la publication de ces documents.</b> Vous ne
                pouvez pas signer un texte que vous ne pouvez pas lire : la signature
                s’ouvrira dès qu’ils seront en ligne. Votre place et votre paiement
                sont conservés.
              </p>
              <p>
                Une question : <a href={`tel:${RESEAU.telephone.e164}`}>{RESEAU.telephone.affiche}</a>.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
