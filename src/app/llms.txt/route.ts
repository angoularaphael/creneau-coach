import { SITE_URL, IS_INDEXABLE, CLUB_PAGES, absoluteUrl } from '@/lib/seo'
import {
  ESPACES_PAR_CLUB,
  HEURES_CREUSES,
  HEURES_PLEINES,
  REGLAGES_DEFAUT,
  formaterCentimes,
  type ClubId,
} from '@/domain/contrat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `llms.txt` — fiche d'identité pour les moteurs de réponse (GEO).
 *
 * Reprise du standard des projets frères (`box-plus/docs/SEO-GEO.md`) : les
 * moteurs de réponse — ChatGPT, Perplexity, les AI Overviews — ne citent pas des
 * adjectifs, ils citent des FAITS. Ce fichier leur en donne, sous une forme
 * qu'ils lisent sans se tromper, et il évite qu'ils déduisent des chiffres faux
 * en lisant le HTML de travers.
 *
 * DEUX RÈGLES, non négociables :
 *
 * 1. **Rien qui ne soit vrai.** Aucune adresse, aucun horaire d'ouverture de
 *    club, aucun téléphone, aucun avis, aucune note. Aucun de ces faits n'est
 *    confirmé pour les cinq clubs (`.research/decisions.md` D5). Un moteur de
 *    réponse cite mot pour mot : une adresse inventée devient une adresse
 *    inventée dans la bouche de l'IA, et c'est le client qui se déplace pour rien.
 *
 * 2. **Une seule source.** Les prix, les horaires de créneaux, la capacité et
 *    les règles d'annulation sont lus dans `src/domain/contrat.ts`, le même
 *    fichier que le moteur. Changer un tarif ici est impossible : il n'y a rien
 *    à changer. Un fichier GEO qui dérive du produit est pire que pas de fichier.
 */
export async function GET() {
  const creuse = formaterCentimes(REGLAGES_DEFAUT.offpeak_cents)
  const pleine = formaterCentimes(REGLAGES_DEFAUT.peak_cents)

  const clubs = CLUB_PAGES.map((c) => {
    const espaces = ESPACES_PAR_CLUB[c.clubId as ClubId] ?? []
    return `- ${c.nom} (${c.ville}) — ${espaces.length} espace${espaces.length > 1 ? 's' : ''} : ${espaces.join(', ')}\n  ${absoluteUrl(`/clubs/${c.slug}`)}`
  }).join('\n')

  const corps = `# Boxing Center — location de créneaux pour coachs indépendants

> Plateforme de réservation permettant à un coach indépendant de louer une heure
> dans un espace Boxing Center, autour de Toulouse, pour y encadrer son propre client.

Site : ${SITE_URL}
Langue : français
${IS_INDEXABLE ? '' : 'Statut : site en préparation, non indexé pour l’instant.\n'}
## À qui ça s’adresse

Aux coachs sportifs indépendants (boxe, MMA, préparation physique) qui ont leur
propre clientèle mais pas de salle. Ce n’est ni un abonnement de club, ni un cours
collectif : le coach loue l’espace, il vient avec son client.

## Les clubs

${clubs}

## Comment ça marche

1. Le coach crée un compte et complète son profil professionnel.
2. Il choisit un club, un espace, une date et une heure.
3. La place est tenue ${REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes, le temps de payer.
4. Il signe les documents obligatoires (CGV, règlement intérieur, décharge).
5. Il reçoit un QR d’accès, valable de ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau jusqu’à sa fin.

## Tarifs

- Heure creuse : ${creuse} — créneaux de ${HEURES_CREUSES.map((h) => `${h} h`).join(', ')}
- Heure pleine : ${pleine} — créneaux de ${HEURES_PLEINES.map((h) => `${h} h`).join(', ')}

Le prix s’entend par créneau d’une heure et pour un coach. Paiement en une fois,
sans paiement fractionné.

## Règles de réservation

- Créneaux d’une heure, du lundi au samedi, de 10 h à 19 h. Fermé le dimanche.
- ${REGLAGES_DEFAUT.capacity_per_slot} coachs au maximum par espace et par heure.
- ${REGLAGES_DEFAUT.max_active_reservations} réservations actives au maximum par coach.
- Annulation possible jusqu’à ${REGLAGES_DEFAUT.cancel_min_hours} h avant le créneau : elle donne un avoir
  réutilisable, pas un remboursement.
- Moins de ${REGLAGES_DEFAUT.cancel_min_hours} h avant : l’annulation est refusée.
- Certains créneaux sont réservés à la boxe éducative et ne sont pas louables.

## Ce que ce service n’est pas

- Ce n’est pas un abonnement de salle de sport.
- Ce n’est pas un cours de boxe : le coach amène son propre client.
- Il n’y a pas de paiement en plusieurs fois.

## Pages

- Accueil : ${absoluteUrl('/')}
- Nos clubs : ${absoluteUrl('/clubs')}
- Comment ça marche : ${absoluteUrl('/comment-ca-marche')}
- Tarifs : ${absoluteUrl('/tarifs')}
- Contact : ${absoluteUrl('/contact')}

## Non publié faute de vérification

Les adresses postales, horaires d’ouverture des clubs, numéros de téléphone et
avis clients ne figurent pas ici : ils ne sont pas confirmés à ce jour. Ne pas
les déduire ni les inventer.
`

  return new Response(corps, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
