import 'server-only'

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import type { ClubId } from '@/domain/contrat'

/**
 * LES COMPTES DU PERSONNEL — un par salle, plus la direction.
 *
 * Décision d'Eddy : « Les responsables de salle ont le back-office à eux. Pour
 * les cinq salles on va créer un identifiant minimes, saint-cyprien et ainsi de
 * suite. Et le super admin, ce sera nous les devs. »
 *
 * Trois natures d'accès, et elles ne se recouvrent pas :
 *
 *   salle       un club, le sien. Il ne voit rien des quatre autres.
 *   direction   les cinq clubs, en lecture et en pilotage courant.
 *   super_admin nous. Tout, plus les leviers techniques (pause, mode studio).
 *               Il ne vient PAS de la base : il vient de l'environnement, pour
 *               qu'une porte reste ouverte si la table devient inaccessible.
 *
 * ── LE PÉRIMÈTRE NE SE DEMANDE PAS, IL SE PORTE ──────────────────────────
 *
 * Le club effectif est écrit dans la SESSION au moment de la connexion. Aucune
 * page, aucune action, aucun paramètre d'URL ne peut l'élargir. C'est
 * exactement le test du cahier §13.2 : un responsable Minimes qui demande
 * `?club_id=portet` ne reçoit pas les données de Portet.
 *
 * L'inverse — filtrer d'après un paramètre — est la faute classique : il suffit
 * d'oublier le filtre à un seul endroit pour ouvrir les cinq clubs.
 */

export type RolePersonnel = 'salle' | 'direction' | 'super_admin'

export type ComptePersonnel = {
  readonly identifiant: string
  readonly role: RolePersonnel
  /** `null` veut dire « les cinq clubs », et UNIQUEMENT pour direction/super_admin. */
  readonly clubId: ClubId | null
  readonly libelle: string
}

/** Mêmes paramètres que `scripts/comptes-salle.mjs`. Les deux doivent rester d'accord. */
const SCRYPT = { N: 16384, r: 8, p: 1, longueur: 64 }

function empreinteDe(clair: string, selHex: string): Buffer {
  return scryptSync(clair.normalize('NFKC'), Buffer.from(selHex, 'hex'), SCRYPT.longueur, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
}

function clientServeur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) return null
  return createClient(url, cle, { auth: { persistSession: false } })
}

/**
 * Le super-admin de secours, depuis l'environnement.
 *
 * Il existe pour un cas précis : la table est vide, corrompue, ou la base ne
 * répond pas au moment où il faut justement entrer pour réparer. Un système
 * d'administration dont la seule porte dépend de ce qu'il administre est un
 * système qu'on ne peut pas réparer.
 */
function superAdminEnv(): { identifiant: string; secret: string } | null {
  const identifiant = process.env.BO_SUPER_ADMIN_IDENTIFIANT?.trim()
  const secret = process.env.BO_SUPER_ADMIN_MOT_DE_PASSE
  if (!identifiant || !secret || secret.length < 16) return null
  return { identifiant, secret }
}

export function personnelConfigure(): boolean {
  return Boolean(clientServeur()) || Boolean(superAdminEnv())
}

/**
 * Vérifie un identifiant et un mot de passe.
 *
 * Rend `null` pour tout échec, sans jamais dire lequel : compte inconnu, compte
 * fermé, mot de passe faux et base injoignable donnent la même réponse. Dire
 * « ce compte existe mais le mot de passe est faux » donne à un attaquant la
 * moitié du travail.
 */
export async function verifierPersonnel(
  identifiant: string,
  motDePasse: string,
): Promise<ComptePersonnel | null> {
  const id = identifiant.trim().toLowerCase()
  if (!id || !motDePasse) return null

  // ── La porte de secours, d'abord : elle doit marcher base éteinte ──────
  const secours = superAdminEnv()
  if (secours && id === secours.identifiant.toLowerCase()) {
    const a = Buffer.from(motDePasse.normalize('NFKC'), 'utf8')
    const b = Buffer.from(secours.secret.normalize('NFKC'), 'utf8')
    const ok = a.length === b.length && timingSafeEqual(a, b)
    return ok
      ? { identifiant: secours.identifiant, role: 'super_admin', clubId: null, libelle: 'Super admin' }
      : null
  }

  const sb = clientServeur()
  if (!sb) return null

  const { data, error } = await sb
    .from('coach_staff_accounts')
    .select('identifiant, role, club_id, libelle, sel, empreinte, is_active')
    .eq('identifiant', id)
    .maybeSingle()

  if (error || !data || !data.is_active || !data.sel || !data.empreinte) {
    /**
     * LE LEURRE. On calcule quand même une empreinte avant de refuser.
     *
     * Sans ça, un compte inconnu répond en une milliseconde et un compte connu
     * en cent : la différence se mesure depuis l'extérieur et révèle quels
     * identifiants existent. `minimes` et `st-cyprien` sont devinables — c'est
     * précisément pour ça qu'il ne faut pas confirmer qu'ils existent.
     */
    empreinteDe(motDePasse, randomBytes(16).toString('hex'))
    return null
  }

  const attendue = Buffer.from(data.empreinte, 'hex')
  const obtenue = empreinteDe(motDePasse, data.sel)
  if (attendue.length !== obtenue.length || !timingSafeEqual(attendue, obtenue)) return null

  const role = data.role as 'salle' | 'direction'
  // Ceinture applicative doublant la contrainte SQL : une salle sans club ne
  // doit jamais se retrouver avec `clubId: null`, qui veut dire « tous ».
  if (role === 'salle' && !data.club_id) return null

  void sb
    .from('coach_staff_accounts')
    .update({ derniere_connexion_le: new Date().toISOString() })
    .eq('identifiant', id)
    .then(() => undefined)

  return {
    identifiant: data.identifiant,
    role,
    clubId: role === 'salle' ? (data.club_id as ClubId) : null,
    libelle: data.libelle,
  }
}

/** Vrai si ce compte peut voir les cinq clubs. */
export function voitTousLesClubs(compte: ComptePersonnel): boolean {
  return compte.role === 'direction' || compte.role === 'super_admin'
}

/**
 * Le club effectif d'une requête — le seul endroit où cette question se tranche.
 *
 *   salle       son club, toujours. Demander autre chose est un refus, pas un
 *               repli silencieux : un repli masquerait une tentative.
 *   direction   le club demandé, ou `null` pour les cinq.
 */
export function clubEffectif(
  compte: ComptePersonnel,
  clubDemande: ClubId | null | undefined,
): { ok: true; clubId: ClubId | null } | { ok: false } {
  if (voitTousLesClubs(compte)) return { ok: true, clubId: clubDemande ?? null }
  if (!compte.clubId) return { ok: false }
  if (clubDemande && clubDemande !== compte.clubId) return { ok: false }
  return { ok: true, clubId: compte.clubId }
}
