'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'

import {
  bloquerCreneau,
  debloquerCreneau,
  poserHoldDeTest,
  supprimerCoach,
  supprimerReservation,
} from '@/lib/dal/back-office'
import { createServiceClient } from '@/lib/supabase/service'
import { estClubId, type ClubId } from '@/domain/contrat'

/**
 * Actions du banc d'essai du back-office.
 *
 * La documentation Next est explicite : une Server Action est une route POST
 * publique, pas une fonction privée. Le proxy ne la couvre pas forcément.
 * Chaque action revalide donc ses entrées elle-même, et `back-office.ts` refuse
 * de répondre en production. Ces actions sont inertes une fois en ligne.
 */

function club(valeur: FormDataEntryValue | null): ClubId {
  const v = String(valeur ?? '')
  if (!estClubId(v)) throw new Error(`club inconnu : ${v}`)
  return v
}

export async function actionBloquer(form: FormData) {
  const c = club(form.get('club'))
  await bloquerCreneau(c, String(form.get('space')), String(form.get('starts_at')), 'back-office')
  revalidatePath('/admin')
}

export async function actionDebloquer(form: FormData) {
  const c = club(form.get('club'))
  await debloquerCreneau(c, String(form.get('space')), String(form.get('starts_at')))
  revalidatePath('/admin')
}

/**
 * Une action passée à `<form action={…}>` doit renvoyer `void`. Le refus du moteur
 * (SLOT_FULL, ACTIVE_LIMIT, SLOT_BLOCKED…) ne doit pourtant pas disparaître : c'est
 * précisément ce qu'on vient observer. Il repart donc dans l'URL, et la page
 * l'affiche. Un rechargement le montre, un partage de lien aussi.
 */
export async function actionPoserHold(form: FormData) {
  const c = club(form.get('club'))
  const resultat = await poserHoldDeTest(
    String(form.get('coach')),
    c,
    String(form.get('space')),
    String(form.get('starts_at')),
  )
  revalidatePath('/admin')

  const q = new URLSearchParams({
    club: c,
    espace: String(form.get('space')),
    semaine: String(form.get('semaine') || ''),
    resultat: resultat.ok ? 'hold_ok' : (resultat.code ?? 'CONFLICT'),
  })
  redirect(`/admin?${q.toString()}`)
}

/**
 * Retour sur la même vue (club, espace, semaine), avec le verdict dans l'URL :
 * une suppression refusée se lit, elle ne finit pas sur une page d'erreur.
 */
function retour(form: FormData, resultat: string): never {
  const q = new URLSearchParams({ resultat })
  for (const cle of ['club', 'espace', 'semaine'] as const) {
    const v = String(form.get(cle) || '')
    if (v) q.set(cle, v)
  }
  redirect(`/admin?${q.toString()}`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function actionSupprimerReservation(form: FormData) {
  const id = String(form.get('id') || '')
  let resultat = 'reservation_supprimee'
  try {
    if (!UUID.test(id)) throw new Error('identifiant invalide')
    await supprimerReservation(id)
  } catch (e) {
    console.warn('[back-office] suppression réservation', e instanceof Error ? e.message : e)
    resultat = 'suppression_refusee'
  }
  revalidatePath('/admin')
  retour(form, resultat)
}

export async function actionSupprimerCoach(form: FormData) {
  const id = String(form.get('id') || '')
  let resultat = 'coach_supprime'
  try {
    if (!UUID.test(id)) throw new Error('identifiant invalide')
    await supprimerCoach(id)
  } catch (e) {
    console.warn('[back-office] suppression coach', e instanceof Error ? e.message : e)
    resultat = 'suppression_refusee'
  }
  revalidatePath('/admin')
  retour(form, resultat)
}

/**
 * Crée un coach de test. Il faut une ligne dans `auth.users` avant `coach_profiles` :
 * la clé étrangère est volontaire, elle reproduit fidèlement Supabase et empêche
 * un profil orphelin sans compte.
 */
export async function actionCreerCoachDeTest(form: FormData) {
  if (process.env.NODE_ENV === 'production') throw new Error('Indisponible en production.')

  const prenom = String(form.get('prenom') || '').trim() || 'Coach'
  const id = randomUUID()
  const email = `${prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${id.slice(0, 6)}@essai.invalid`
  const sb = createServiceClient()

  const { error: e1 } = await sb.rpc('coach_creer_utilisateur_essai', { p_id: id, p_email: email })
  if (e1) throw new Error(`auth.users : ${e1.message}`)

  const { error: e2 } = await sb
    .from('coach_profiles')
    .insert({ id, first_name: prenom, last_name: 'Essai', email, status: 'active' })
  if (e2) throw new Error(`profil : ${e2.message}`)

  revalidatePath('/admin')
}
