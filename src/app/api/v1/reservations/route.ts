import { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/http';
import { isClubId } from '@/lib/clubs';
import { clientServeur } from '@/lib/supabase/serveur';
import { CODES_ERREUR, type CodeErreur } from '@/domain/contrat';
import type { ErrorCode } from '@/lib/api/types';
import { contexteRequete } from '@/lib/security/request-context';
import { checkRateLimit, reponse429 } from '@/lib/security/rate-limit';
import { valider, lireCorps } from '@/lib/security/validation';
import { CreateReservationBody } from '@/lib/security/schemas/reservations';
import { auditDeny, auditOk } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Réservations — cahier §6. LOT C.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE FICHIER APPELAIT `createHold` DE `@/lib/mock/reservations`.
 *
 * C'était une `Map` posée sur `globalThis`, avec sa propre logique de capacité
 * réécrite en JavaScript et un `CAPACITY = 2` en dur. Trois conséquences, toutes
 * réelles en production :
 *
 *   1. Chaque instance Vercel a sa propre mémoire. Deux coachs servis par deux
 *      lambdas voyaient chacun `0/2` sur le même créneau et réservaient tous les
 *      deux. La capacité du cahier §3.2 était tout simplement inapplicable.
 *   2. Tout disparaissait à chaque démarrage à froid et à chaque déploiement.
 *   3. Le prix venait d'une table fabriquée, pas de `coach_tariffs` — le cahier
 *      §1.4 exige un prix calculé serveur.
 *
 * La route appelle maintenant `coach_create_hold`, la fonction Postgres :
 * verrou consultatif par créneau, siège attribué par index unique partiel, prix
 * figé depuis `coach_tariffs`, limite de 3 actives, blocages éducative, et
 * idempotence sur 24 h. La base arbitre, pas le processus.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** La fonction SQL renvoie le code du contrat ; le statut HTTP se déduit ici, une seule fois. */
function statutHttp(code: string): number {
  return CODES_ERREUR[code as CodeErreur] ?? 400;
}

type RetourHold =
  | { ok: true; reservation: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

export async function GET(req: NextRequest) {
  const sb = await clientServeur();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const statut = url.searchParams.get('status');

  /*
   * Aucun filtre sur `coach_id` ici, et c'est VOLONTAIRE : la RLS du cahier §12
   * restreint déjà la lecture au coach connecté. Filtrer en plus donnerait
   * l'illusion que c'est l'applicatif qui protège — et le jour où quelqu'un
   * retire la ligne, la fuite serait silencieuse. On laisse la base décider,
   * c'est le test contractuel §13.1.
   */
  let q = sb
    .from('coach_reservations')
    .select(
      'id, coach_id, club_id, space_id, starts_at, ends_at, amount_cents, currency, status, payment_status, payment_provider, signature_status, signed_at, hold_expires_at, qr_valid_from, qr_valid_to, deciplus_job_status, credit_id, created_at',
    )
    .order('starts_at', { ascending: true })
    .limit(100);

  if (from) q = q.gte('starts_at', from);
  if (to) q = q.lte('starts_at', `${to}T23:59:59+02:00`);
  if (statut) q = q.eq('status', statut);

  const { data, error } = await q;
  if (error) {
    console.error('[reservations] lecture', { code: error.code });
    return jsonError(409, 'CONFLICT', 'Lecture impossible.');
  }

  return jsonOk({
    reservations: (data ?? []).map((r) => ({
      ...r,
      // `qr_ready` est un booléen dérivé : on n'expose jamais `qr_jti` (cahier §10).
      qr_ready: r.status === 'confirmed' && Boolean(r.qr_valid_from),
    })),
    next_cursor: null,
  });
}

export async function POST(req: NextRequest) {
  /*
   * Couche de sécurité portée du projet AMAZ, dans l'ordre où elle doit courir :
   *   1. contexte de requête   — identifiant corrélable, IP hachée pour l'audit ;
   *   2. limite de débit       — cahier §1.5, 10 par minute sur cette route ;
   *   3. idempotence           — la clé est portée jusqu'à `coach_create_hold`,
   *                              qui la pose et la relâche dans SA transaction ;
   *   4. validation stricte    — zod `strictObject` : un `amount_cents` glissé
   *                              dans le corps est un 400 visible, pas un champ
   *                              ignoré en silence ;
   *   5. audit                 — refus comme succès, en liste blanche.
   *
   * Ce qui a été REFUSÉ d'AMAZ et pourquoi : le proof-of-work (mauvais modèle de
   * menace ici, et coût réel en serverless) et le filtrage VPN (il bloque des
   * coachs qui paient, et sa liste codée en dur ne contient que des adresses
   * RFC 1918 qui ne peuvent jamais être une IP cliente publique).
   */
  const ctx = contexteRequete(req);

  const cle = req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key');
  if (!cle) {
    return jsonError(400, 'VALIDATION_ERROR', 'Header Idempotency-Key requis.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cle)) {
    return jsonError(400, 'VALIDATION_ERROR', 'Idempotency-Key doit être un UUID v4.');
  }

  const sb = await clientServeur();
  const { data: claims } = await sb.auth.getClaims();
  const coachId = claims?.claims?.sub ?? null;
  if (!coachId) return jsonError(401, 'UNAUTHENTICATED', 'Session requise.');

  // Limite par IP **et** par coach, consommée de façon tout-ou-rien (cahier §1.5).
  const verdict = await checkRateLimit('reservations', { ipHash: ctx.ipHash, coachId });
  if (!verdict.allowed) {
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.rate_limited',
      meta: { request_id: ctx.requestId, dimension: verdict.dimension },
    });
    return reponse429(verdict, ctx.requestId);
  }

  const corps = await lireCorps(req, ctx.requestId);
  if (!corps.ok) return corps.reponse;

  const v = valider(CreateReservationBody, corps.json, ctx.requestId);
  if (!v.ok) {
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.invalide',
      // `problemes` ne porte QUE { path, code } — jamais la valeur reçue (spec-04 §8.2).
      meta: { request_id: ctx.requestId, issues: v.problemes },
    });
    return v.reponse;
  }

  const { data, error } = await sb.rpc('coach_create_hold', {
    p_club_id: v.data.club_id,
    p_space_id: v.data.space_id,
    p_starts_at: v.data.starts_at,
    p_idempotency_key: cle,
  });

  if (error) {
    // Incident (transport, RLS, contrainte). On journalise, on ne fuite rien.
    console.error('[reservations] coach_create_hold', {
      requestId: ctx.requestId,
      code: error.code,
    });
    return jsonError(409, 'CONFLICT', 'Réservation impossible.');
  }

  const r = data as RetourHold;
  if (!r?.ok) {
    /*
     * Le code vient de la fonction SQL. On vérifie qu'il appartient bien à
     * l'énumération du contrat avant de le renvoyer : un code inventé côté base
     * ne doit pas pouvoir sortir de l'API et casser le client de Brad.
     */
    const brut = r?.error?.code ?? 'CONFLICT';
    const code = (brut in CODES_ERREUR ? brut : 'CONFLICT') as ErrorCode;
    await auditDeny({
      actorId: coachId,
      role: 'coach',
      action: 'reservation.hold.refus',
      clubId: v.data.club_id,
      meta: { request_id: ctx.requestId, code },
    });
    return jsonError(
      statutHttp(code),
      code,
      r?.error?.message ?? 'Réservation impossible.',
      r?.error?.details,
    );
  }

  const resa = r.reservation as { id?: string };
  auditOk({
    actorId: coachId,
    role: 'coach',
    action: 'reservation.hold.cree',
    clubId: v.data.club_id,
    targetType: 'reservation',
    targetId: resa.id ?? null,
    meta: { request_id: ctx.requestId },
  });

  return jsonOk(r.reservation, { status: 201 });
}
