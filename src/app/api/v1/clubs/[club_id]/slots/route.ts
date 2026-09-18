import { isClubId } from '@/lib/clubs';
import type { ClubId } from '@/lib/api/types';
import { jsonError, jsonOk } from '@/lib/api/http';
import { createServiceClient } from '@/lib/supabase/service';
import { clientServeur } from '@/lib/supabase/serveur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ club_id: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type LigneGrille = {
  club_id: string;
  space_id: string;
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  tariff: 'offpeak' | 'peak';
  capacity: number;
  taken: number;
  state: 'open' | 'full' | 'blocked' | 'past';
  hold_expire_le: string | null;
};

/**
 * GET /api/v1/clubs/:id/slots — cahier §4.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Cette route lisait `buildMockSlotGrid`, une grille fabriquée en mémoire de
 * processus. Elle lit maintenant `coach_slot_grid`, la fonction Postgres.
 *
 * Pourquoi ça comptait : sur Vercel, chaque invocation est un processus séparé.
 * Une grille en mémoire n'est partagée par personne — deux coachs servis par
 * deux instances voyaient tous les deux `0/2` sur le même créneau et
 * réservaient tous les deux. La capacité de 2 du cahier §3.2 était
 * inapplicable, et le prix ne venait pas de `coach_tariffs`.
 *
 * Le back-office et le coach lisent désormais la MÊME fonction SQL : ils ne
 * peuvent plus voir deux plannings différents.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le payload public ne contient AUCUN nom de coach — le cahier §4 l'interdit.
 * `coach_slot_grid` ne renvoie que des compteurs, la règle est tenue à la source
 * et pas par une projection qu'on pourrait oublier ici.
 */
export async function GET(req: Request, ctx: Ctx) {
  const params = await ctx.params;
  if (!isClubId(params.club_id)) {
    return jsonError(404, 'NOT_FOUND', 'Club introuvable.');
  }
  const clubId: ClubId = params.club_id;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const spaceId = url.searchParams.get('space_id');

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return jsonError(400, 'VALIDATION_ERROR', 'Paramètres from/to requis (YYYY-MM-DD).', {
      from,
      to,
    });
  }
  if (from > to) {
    return jsonError(400, 'VALIDATION_ERROR', 'from doit être ≤ to.');
  }

  // La grille est publique et ne contient aucune donnée personnelle : on la lit
  // avec le client de service, sans exiger de session.
  const sb = createServiceClient();
  const { data, error } = await sb.rpc('coach_slot_grid', {
    p_club_id: clubId,
    p_space_id: spaceId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('[slots] lecture de la grille', { code: error.code });
    return jsonError(409, 'CONFLICT', 'Grille indisponible.');
  }

  const lignes = (data ?? []) as LigneGrille[];
  if (lignes.length === 0 && spaceId) {
    // Aucun créneau ET un espace demandé : soit l'espace n'existe pas dans ce
    // club, soit la plage ne contient aucun jour ouvré. On ne distingue pas —
    // le cahier §1.3 veut un 404 indistinct sur tout ce qui est hors périmètre.
    return jsonError(404, 'NOT_FOUND', 'Club ou espace introuvable.');
  }

  /*
   * `mine` : le cahier §4 le prévoit pour un coach connecté. On l'ajoute en
   * SECONDE passe, avec la session du coach et la RLS — jamais depuis la grille
   * publique, qui ne doit rien savoir de personne.
   */
  const mine = await creneauxDuCoach(clubId, from, to);

  return jsonOk({
    club_id: clubId,
    ...(spaceId ? { space_id: spaceId } : {}),
    slots: lignes.map((l) => ({
      starts_at: l.starts_at,
      ends_at: l.ends_at,
      amount_cents: l.amount_cents,
      tariff: l.tariff,
      capacity: l.capacity,
      taken: l.taken,
      state: l.state,
      ...(mine.has(`${l.space_id}|${l.starts_at}`) ? { mine: true } : {}),
    })),
  });
}

/**
 * Créneaux déjà réservés par le coach connecté, s'il y en a un.
 *
 * Passe par le client à SESSION, donc par la RLS : un anonyme obtient un
 * ensemble vide, et un coach ne peut pas voir les réservations d'un autre même
 * si cette fonction était appelée de travers.
 */
async function creneauxDuCoach(
  clubId: ClubId,
  from: string,
  to: string,
): Promise<Set<string>> {
  try {
    const sb = await clientServeur();
    const { data } = await sb.auth.getClaims();
    if (!data?.claims?.sub) return new Set();

    const { data: lignes } = await sb
      .from('coach_reservations')
      .select('space_id, starts_at')
      .eq('club_id', clubId)
      .gte('starts_at', from)
      .lte('starts_at', `${to}T23:59:59+02:00`)
      .in('status', ['held', 'awaiting_signature', 'confirmed']);

    return new Set(
      (lignes ?? []).map((l) => `${l.space_id}|${new Date(l.starts_at as string).toISOString()}`),
    );
  } catch {
    // Pas de session, ou Supabase muet : la grille publique reste servie.
    return new Set();
  }
}
