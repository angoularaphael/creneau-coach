import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Porte du back-office — mot de passe partagé, session signée.
 *
 * Ce n'est PAS l'authentification définitive. Le cahier §1.1 prévoit deux rôles
 * staff — `manager_salle` (avec son `club_id`) et `direction` — portés par des
 * comptes Supabase, avec la RLS du §12 derrière. Ici, un seul mot de passe pour
 * toute l'équipe, et donc aucune isolation par club : qui entre voit les cinq.
 *
 * C'est assumé et temporaire. Ce que ça apporte quand même, et qui manquait
 * complètement il y a une heure : la route n'est plus ouverte à l'internet entier.
 *
 * Ce qui reste à faire, et qui est bloquant avant d'ouvrir aux responsables de salle :
 *   — un compte par personne, pas un mot de passe partagé ;
 *   — le périmètre club lu dans le JWT, jamais dans l'URL (test contractuel §13.2) ;
 *   — la lecture via le client à session, pour que la RLS s'applique.
 */

const COOKIE = 'bo_session'
const DUREE_S = 8 * 60 * 60 // 8 h — une journée de travail, pas plus.

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).')
  }
  return s
}

function motDePasseAttendu(): string {
  const p = process.env.ADMIN_PASSWORD
  if (!p || p.length < 12) {
    throw new Error('ADMIN_PASSWORD manquant ou trop court (12 caractères minimum).')
  }
  return p
}

/** Le back-office est-il configuré pour s'ouvrir ? Sert à afficher une erreur utile. */
export function porteConfiguree(): boolean {
  return Boolean(
    process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32 &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.length >= 12,
  )
}

/**
 * Comparaison en TEMPS CONSTANT.
 *
 * `a === b` sur une chaîne s'arrête au premier caractère différent : le temps de
 * réponse fuit la longueur du préfixe correct, et permet de deviner le mot de
 * passe caractère par caractère. On hache d'abord pour égaliser les longueurs,
 * parce que `timingSafeEqual` jette si les tampons diffèrent en taille — et la
 * taille est elle-même une information.
 */
function memeMotDePasse(fourni: string, attendu: string): boolean {
  const h = (v: string) => createHmac('sha256', secret()).update(v).digest()
  return timingSafeEqual(h(fourni), h(attendu))
}

export function motDePasseValide(fourni: string): boolean {
  try {
    return memeMotDePasse(fourni, motDePasseAttendu())
  } catch {
    return false
  }
}

/**
 * Jeton de session : `expiration.aléa.signature`.
 *
 * L'aléa rend deux sessions ouvertes à la même seconde distinctes, donc
 * révocables indépendamment le jour où on tiendra une liste de révocation.
 * La signature couvre les deux autres champs : ni l'expiration ni l'aléa ne
 * peuvent être retouchés sans invalider le jeton.
 */
export function creerJeton(): { valeur: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + DUREE_S
  const alea = randomBytes(16).toString('hex')
  const charge = `${exp}.${alea}`
  const signature = createHmac('sha256', secret()).update(charge).digest('hex')
  return { valeur: `${charge}.${signature}`, maxAge: DUREE_S }
}

export function jetonValide(valeur: string | undefined): boolean {
  if (!valeur) return false
  const parts = valeur.split('.')
  if (parts.length !== 3) return false
  const [exp, alea, signature] = parts as [string, string, string]

  const attendue = createHmac('sha256', secret()).update(`${exp}.${alea}`).digest('hex')
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(attendue, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  // L'expiration n'est vérifiée QU'APRÈS la signature : sinon on répondrait
  // différemment à un jeton forgé selon sa date, ce qui renseigne l'attaquant.
  const secondes = Number(exp)
  return Number.isFinite(secondes) && secondes > Math.floor(Date.now() / 1000)
}

export const COOKIE_BO = COOKIE

export function optionsCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: DUREE_S,
  }
}
