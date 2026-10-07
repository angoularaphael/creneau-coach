import 'server-only'

import { nomClub } from '@/lib/clubs'
import { createServiceClient } from '@/lib/supabase/service'

import { envoyerCourriel, gabarit, urlPublique } from './envoi'

const FUSEAU = 'Europe/Paris'

function quand(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function destinataire(
  reservationId: string,
): Promise<{ email: string; prenom: string; club: string; debut: string } | null> {
  const sb = createServiceClient()
  const { data: resa } = await sb
    .from('coach_reservations')
    .select('id, club_id, starts_at, coach_id')
    .eq('id', reservationId)
    .maybeSingle()
  if (!resa?.coach_id) return null
  const { data: profil } = await sb
    .from('coach_profiles')
    .select('email, first_name')
    .eq('id', resa.coach_id)
    .maybeSingle()
  const email = String(profil?.email || '').trim()
  if (!email) return null
  return {
    email,
    prenom: String(profil?.first_name || '').trim(),
    club: nomClub(String(resa.club_id || '')),
    debut: quand(String(resa.starts_at || '')),
  }
}

/** Paiement reçu : le coach doit encore signer. N'échoue jamais l'encaissement. */
export async function prevenirASigner(reservationId: string): Promise<void> {
  try {
    const qui = await destinataire(reservationId)
    if (!qui) return
    const lien = `${urlPublique()}/espace-coach/reservations/${reservationId}/signature`
    const g = gabarit({
      titre: qui.prenom ? `${qui.prenom}, votre heure est réservée` : 'Votre heure est réservée',
      paragraphes: [
        `Le paiement de votre créneau au ${qui.club} (${qui.debut}, heure de Paris) est reçu. Il reste à signer les documents pour confirmer l'accès.`,
      ],
      bouton: { libelle: 'Signer les documents', lien },
    })
    const envoi = await envoyerCourriel({ a: qui.email, sujet: 'Signez vos documents — Boxing Center', ...g })
    if (!envoi.ok) console.error('[mail] a signer', { raison: envoi.raison })
  } catch (e) {
    console.error('[mail] a signer', { raison: e instanceof Error ? e.name : 'erreur' })
  }
}

/** Signature enregistrée : le créneau est confirmé, le QR est dans l'espace. */
export async function prevenirConfirme(reservationId: string): Promise<void> {
  try {
    const qui = await destinataire(reservationId)
    if (!qui) return
    const lien = `${urlPublique()}/espace-coach/reservations/${reservationId}/qr`
    const g = gabarit({
      titre: 'Créneau confirmé',
      paragraphes: [
        `Votre créneau au ${qui.club} (${qui.debut}, heure de Paris) est confirmé. Le QR d'accès s'affiche dans votre espace, cinq minutes avant l'heure.`,
      ],
      bouton: { libelle: 'Voir mon accès', lien },
    })
    const envoi = await envoyerCourriel({ a: qui.email, sujet: 'Créneau confirmé — Boxing Center', ...g })
    if (!envoi.ok) console.error('[mail] confirme', { raison: envoi.raison })
  } catch (e) {
    console.error('[mail] confirme', { raison: e instanceof Error ? e.name : 'erreur' })
  }
}

/** Formulaire public. La réponse revient à la personne qui a écrit. */
export async function envoyerContact(o: {
  nom: string
  email: string
  message: string
}): Promise<{ ok: true } | { ok: false; raison: string }> {
  const vers =
    process.env.DIRECTION_NOTIFY_EMAIL?.trim() ||
    process.env.ALERT_EMAIL?.trim() ||
    process.env.MAIL_REPLY_TO?.trim()
  if (!vers) return { ok: false, raison: 'destinataire_absent' }
  const g = gabarit({
    titre: 'Message du site coach',
    paragraphes: [`${o.nom} (${o.email}) écrit :`, o.message],
    bouton: { libelle: 'Répondre', lien: `mailto:${o.email}` },
  })
  return envoyerCourriel({
    a: vers,
    sujet: 'Contact — site coach Boxing Center',
    reponse: o.email,
    ...g,
  })
}
