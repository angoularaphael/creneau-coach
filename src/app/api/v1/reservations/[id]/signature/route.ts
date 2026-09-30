import { NextRequest } from 'next/server'

import { lireReservation, listerDocumentsCourants, marquerSigne } from '@/lib/dal/reservations'
import { versReservationPublique } from '@/lib/dal/map'
import { exigerSession } from '@/lib/dal/acteur'
import { lireMonProfil } from '@/lib/dal/profil'
import { SEAU_PRIVE } from '@/lib/documents/obligatoires'
import { fabriquerAttestation } from '@/lib/signature/attestation'
import { createServiceClient } from '@/lib/supabase/service'
import { nouvelJti } from '@/lib/qr-access'
import {
  checkRateLimit,
  contexteRequete,
  lireCorps,
  refusOrigine,
  schemas,
  valider,
} from '@/lib/security'
import { reponse429 } from '@/lib/security/rate-limit'
import { reponseDepuisErreur, reponseErreur, reponseJson } from '@/lib/http/erreurs'
import { prevenirConfirme } from '@/lib/mail/transactionnel'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const session = await exigerSession(ctx, { lectureSeule: true })
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)

  const { id } = await ctxRoute.params
  const lecture = await lireReservation(ctx, session.valeur.supabase, session.valeur.acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)

  const docs = await listerDocumentsCourants(ctx, session.valeur.supabase)
  if (!docs.ok) return reponseDepuisErreur(docs.erreur, ctx.requestId)

  return reponseJson({ documents: docs.valeur }, 200, ctx.requestId)
}

/**
 * Signer — cahier §16.
 *
 * Jusqu'au 27/09/2026, cette route recevait le tracé, le JETAIT, et passait la
 * réservation en `confirmed` en désignant un PDF jamais fabriqué. Aucune ligne
 * dans `coach_signatures` : la preuve que le cahier demande d'archiver
 * n'existait pas.
 *
 * Désormais, dans cet ordre :
 *   1. les documents signés doivent être les versions en vigueur ET publiées
 *      (un fichier existe) — sinon on ne fait signer rien ;
 *   2. l'attestation PDF est fabriquée (signataire, réservation, chaque
 *      document avec son empreinte, tracé, horodatage, IP, navigateur) ;
 *   3. elle est déposée dans le seau privé, sous `signatures/`, un dossier où
 *      le coach ne peut PAS écrire — il ne doit pas pouvoir réécrire sa propre
 *      preuve ;
 *   4. `coach_mark_signed` confirme la réservation ET écrit une ligne de preuve
 *      par document, dans la même transaction.
 */
export async function POST(req: NextRequest, ctxRoute: Ctx) {
  const ctx = contexteRequete(req)
  const etrangere = refusOrigine(req, ctx.requestId)
  if (etrangere) return etrangere
  const session = await exigerSession(ctx)
  if (!session.ok) return reponseDepuisErreur(session.erreur, ctx.requestId)
  const { supabase, acteur } = session.valeur

  const limite = await checkRateLimit('signature', {
    ipHash: ctx.ipHash,
    coachId: acteur.id,
  })
  if (!limite.allowed) return reponse429(limite, ctx.requestId)

  const corps = await lireCorps(req, ctx.requestId)
  if (!corps.ok) return corps.reponse
  const body = valider(schemas.SignatureBody, corps.json, ctx.requestId)
  if (!body.ok) return body.reponse

  const { id } = await ctxRoute.params

  // La réservation, lue AVEC la session : la RLS garantit qu'elle est à lui.
  const lecture = await lireReservation(ctx, supabase, acteur, id)
  if (!lecture.ok) return reponseDepuisErreur(lecture.erreur, ctx.requestId)
  const resa = versReservationPublique(lecture.valeur as unknown as Record<string, unknown>)
  if (resa.status === 'confirmed') {
    // Rejeu (double clic, réseau lent) : déjà signé, rien à refaire.
    return reponseJson(resa, 200, ctx.requestId)
  }

  const docs = await listerDocumentsCourants(ctx, supabase)
  if (!docs.ok) return reponseDepuisErreur(docs.erreur, ctx.requestId)
  const publies = docs.valeur.filter((d) => d.file_sha256)
  if (publies.length < 3 || publies.length !== docs.valeur.length) {
    return reponseErreur(
      'CONFLICT',
      { raison: 'documents_non_publies' },
      'Les documents à signer ne sont pas encore publiés par Boxing Center. Votre place et votre paiement sont conservés.',
      ctx.requestId,
    )
  }
  const attendus = new Set(publies.map((d) => d.id))
  const recus = new Set(body.data.document_ids)
  if (recus.size !== attendus.size || ![...recus].every((d) => attendus.has(d))) {
    return reponseErreur(
      'VALIDATION_ERROR',
      { issues: [{ path: 'document_ids', code: 'mismatch' }] },
      'Les documents ont changé entre-temps. Rechargez la page pour lire la version en vigueur.',
      ctx.requestId,
    )
  }

  const profil = await lireMonProfil(ctx, supabase, acteur)
  const nom = profil.ok
    ? [profil.valeur.first_name, profil.valeur.last_name].filter(Boolean).join(' ').trim()
    : ''
  const email = profil.ok ? (profil.valeur.email ?? '') : ''

  const signeLe = new Date()
  const png = Buffer.from(body.data.signature_image.slice(body.data.signature_image.indexOf(',') + 1), 'base64')
  const attestation = await fabriquerAttestation({
    reservation: {
      id: resa.id,
      club_id: resa.club_id,
      space_id: resa.space_id,
      starts_at: resa.starts_at,
      ends_at: resa.ends_at,
      amount_cents: resa.amount_cents,
    },
    coach: { nom: nom || 'Nom non renseigné', email: email || 'non renseignée' },
    documents: publies.map((d) => ({ title: d.title, version: d.version, file_sha256: d.file_sha256 as string })),
    signaturePng: png,
    mode: body.data.signature_mode,
    signeLe,
    navigateur: ctx.userAgent,
    ip: ctx.ip,
  })

  // Un chemin par tentative : deux envois simultanés ne s'écrasent pas. Seule
  // l'attestation retenue par la transaction est référencée en base.
  const chemin = `signatures/${acteur.id}/${resa.id}-${signeLe.getTime()}.pdf`
  const depot = await createServiceClient()
    .storage.from(SEAU_PRIVE)
    .upload(chemin, attestation.octets, { contentType: 'application/pdf', upsert: false })
  if (depot.error) {
    console.error(`[${ctx.requestId}] attestation`, { message: depot.error.message })
    return reponseErreur(
      'CONFLICT',
      {},
      'L’enregistrement de la signature a échoué. Rien n’a été signé : réessayez.',
      ctx.requestId,
    )
  }

  const signe = await marquerSigne(ctx, supabase, {
    reservationId: id,
    pdfPath: chemin,
    pdfSha256: attestation.sha256,
    documentIds: [...attendus],
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    qrJti: nouvelJti(),
  })
  if (!signe.ok) return reponseDepuisErreur(signe.erreur, ctx.requestId)

  const row = signe.valeur as Record<string, unknown>
  await prevenirConfirme(id)

  return reponseJson(versReservationPublique(row), 200, ctx.requestId)
}
