import 'server-only'

import { estClubId, type ClubId } from '@/domain/contrat'
import type { ClubDetail, ClubSummary, Slot, SlotGrid } from '@/lib/api/types'
import { erreur } from '@/lib/http/erreurs'
import { COPY_CLUBS } from '@/lib/clubs'
import { clientServeur } from '@/lib/supabase/serveur'

import { echec, succes, type ResultatDal } from './acteur'

type ClubRow = {
  id: string
  name: string
  city: string | null
  hero_image: string | null
  description: string | null
  amenities: string[] | null
}

type SpaceRow = {
  id: string
  club_id: string
  name: string
  capacity: number
}

function enrichir(club: ClubRow, espaces: SpaceRow[]): ClubDetail {
  const copy = estClubId(club.id) ? COPY_CLUBS[club.id] : undefined
  return {
    id: club.id as ClubId,
    name: club.name,
    city: club.city ?? copy?.city,
    hero_image: club.hero_image ?? copy?.hero_image,
    spaces: espaces
      .filter((s) => s.club_id === club.id)
      .map((s) => ({ id: s.id, name: s.name, capacity: s.capacity })),
    description: club.description ?? copy?.description,
    amenities: club.amenities?.length ? club.amenities : copy?.amenities,
    transport: copy?.transport,
    peak_hours: copy?.peak_hours,
    offpeak_hours: copy?.offpeak_hours,
  }
}

export async function listerClubsPublic(): Promise<ResultatDal<ClubSummary[]>> {
  const sb = await clientServeur()
  const [{ data: clubs, error: e1 }, { data: espaces, error: e2 }] = await Promise.all([
    sb.from('coach_clubs').select('id, name, city, hero_image, description, amenities').eq('is_active', true).order('name'),
    sb.from('coach_spaces').select('id, club_id, name, capacity').eq('is_active', true).order('id'),
  ])
  if (e1 || e2) {
    console.error('[dal] clubs', { code: e1?.code ?? e2?.code })
    return echec(erreur('CONFLICT', {}))
  }
  const details = (clubs as ClubRow[] | null ?? []).map((c) =>
    enrichir(c, (espaces as SpaceRow[] | null) ?? []),
  )
  return succes(
    details.map(({ id, name, city, hero_image, spaces }) => ({
      id,
      name,
      city,
      hero_image,
      spaces,
    })),
  )
}

export async function lireClubPublic(clubId: string): Promise<ResultatDal<ClubDetail>> {
  if (!estClubId(clubId)) return echec(erreur('NOT_FOUND', {}))
  const sb = await clientServeur()
  const [{ data: club, error: e1 }, { data: espaces, error: e2 }] = await Promise.all([
    sb.from('coach_clubs').select('id, name, city, hero_image, description, amenities').eq('id', clubId).eq('is_active', true).maybeSingle<ClubRow>(),
    sb.from('coach_spaces').select('id, club_id, name, capacity').eq('club_id', clubId).eq('is_active', true).order('id'),
  ])
  if (e1 || e2) {
    console.error('[dal] club', { code: e1?.code ?? e2?.code })
    return echec(erreur('CONFLICT', {}))
  }
  if (!club) return echec(erreur('NOT_FOUND', {}))
  return succes(enrichir(club, (espaces as SpaceRow[] | null) ?? []))
}

export async function lireGrillePublic(entree: {
  readonly clubId: ClubId
  readonly spaceId?: string
  readonly from: string
  readonly to: string
}): Promise<ResultatDal<SlotGrid>> {
  const sb = await clientServeur()
  const { data, error } = await sb.rpc('coach_slot_grid', {
    p_club_id: entree.clubId,
    p_space_id: entree.spaceId ?? null,
    p_from: entree.from,
    p_to: entree.to,
  })
  if (error) {
    console.error('[dal] grille', { code: error.code })
    return echec(erreur('CONFLICT', {}))
  }
  const slots = ((data ?? []) as Slot[]).map((s) => ({
    ...s,
    starts_at: String(s.starts_at),
    ends_at: String(s.ends_at),
    amount_cents: Number(s.amount_cents),
    capacity: Number(s.capacity),
    taken: Number(s.taken),
  }))
  return succes({
    club_id: entree.clubId,
    space_id: entree.spaceId,
    slots,
  })
}
