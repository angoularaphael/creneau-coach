import 'server-only'

import { cache } from 'react'

import { CLUB_IDS, type ClubId } from '@/domain/contrat'
import { lireGrillePublic } from '@/lib/dal/clubs'

/**
 * Les prochaines heures libres des cinq clubs — ce que le site montre en
 * premier, parce que c'est la seule chose qu'un coach vient vérifier.
 *
 * Même source que la grille de chaque club (`coach_slot_grid`, via
 * `lireGrillePublic`) : l'accueil ne peut pas annoncer une heure que la page du
 * club refuserait. Trois jours de fenêtre suffisent à trouver les trois
 * prochaines heures même un samedi soir (le dimanche est fermé).
 *
 * Un club qui ne répond pas disparaît de la liste au lieu de casser la page :
 * l'accueil reste debout même si une grille échoue.
 */

export type HeureLibre = {
  readonly startsAt: string
  readonly endsAt: string
  readonly spaceId: string
  readonly amountCents: number
  readonly tariff: 'offpeak' | 'peak'
}

export type ProchainesDuClub = {
  readonly clubId: ClubId
  readonly heures: readonly HeureLibre[]
  /** Heures libres sur toute la fenêtre — la profondeur de l'offre, pas seulement la tête. */
  readonly totalLibres: number
}

function jourParis(decalage: number): string {
  const d = new Date(Date.now() + decalage * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export const prochainesHeuresLibres = cache(async (parClub = 3): Promise<ProchainesDuClub[]> => {
  const du = jourParis(0)
  const au = jourParis(2)
  const maintenant = Date.now()

  const resultats = await Promise.all(
    CLUB_IDS.map(async (clubId): Promise<ProchainesDuClub | null> => {
      const g = await lireGrillePublic({ clubId, from: du, to: au }).catch(() => null)
      if (!g || !g.ok) return null
      const libres = (g.valeur.slots as unknown as Array<Record<string, unknown>>)
        .filter((s) => s.state === 'open' && new Date(String(s.starts_at)).getTime() > maintenant)
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))

      // Une heure n'apparaît qu'une fois même si deux espaces du club sont libres.
      const vues = new Set<string>()
      const heures: HeureLibre[] = []
      for (const s of libres) {
        const debut = String(s.starts_at)
        if (vues.has(debut)) continue
        vues.add(debut)
        heures.push({
          startsAt: debut,
          endsAt: String(s.ends_at),
          spaceId: String(s.space_id ?? ''),
          amountCents: Number(s.amount_cents),
          tariff: s.tariff === 'peak' ? 'peak' : 'offpeak',
        })
        if (heures.length >= parClub) break
      }
      return { clubId, heures, totalLibres: libres.length }
    }),
  )

  return resultats.filter((r): r is ProchainesDuClub => r !== null)
})
