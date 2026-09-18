import type { ClubId, Slot, SlotGrid, Tariff } from '@/lib/api/types';
import { getClub } from '@/lib/clubs';

const OFFPEAK_HOURS = new Set([10, 11, 14, 15, 16]);
const PEAK_HOURS = new Set([12, 13, 17, 18]);
const CAPACITY = 2;

function parisWeekdayIndex(isoDate: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  }).format(new Date(`${isoDate}T12:00:00+02:00`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

function tariffForHour(hour: number): Tariff | null {
  if (OFFPEAK_HOURS.has(hour)) return 'offpeak';
  if (PEAK_HOURS.has(hour)) return 'peak';
  return null;
}

function amountForTariff(tariff: Tariff): number {
  return tariff === 'peak' ? 1500 : 1000;
}

function isBlockedEducational(isoDate: string, hour: number, clubId: ClubId): boolean {
  // Portet: éducative paramétrable — mock semaine 0 = pas de blocage défaut
  if (clubId === 'portet') return false;
  const weekday = parisWeekdayIndex(isoDate);
  const isWedOrSat = weekday === 3 || weekday === 6;
  return isWedOrSat && (hour === 15 || hour === 16);
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function parisOffset(isoDate: string): string {
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'shortOffset',
  }).formatToParts(probe);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = raw.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!m) return '+01:00';
  const h = Number(m[1]);
  const mm = m[2] ?? '00';
  const sign = h >= 0 ? '+' : '-';
  const abs = Math.abs(h).toString().padStart(2, '0');
  return `${sign}${abs}:${mm}`;
}

function slotIso(isoDate: string, hour: number): { starts_at: string; ends_at: string } {
  const off = parisOffset(isoDate);
  const hh = hour.toString().padStart(2, '0');
  const next = (hour + 1).toString().padStart(2, '0');
  return {
    starts_at: `${isoDate}T${hh}:00:00${off}`,
    ends_at: `${isoDate}T${next}:00:00${off}`,
  };
}

/**
 * Grille fake contrat-compatible (Eddy livrera le vrai moteur).
 * Lun–sam 10h–19h, tarifs cahier, éducative mer+sam 15–17 (sauf Portet).
 */
export function buildMockSlotGrid(
  clubId: ClubId,
  from: string,
  to: string,
  spaceId?: string,
): SlotGrid | null {
  const club = getClub(clubId);
  if (!club) return null;

  const space = spaceId
    ? club.spaces.find((s) => s.id === spaceId)
    : club.spaces[0];
  if (spaceId && !space) return null;

  const now = Date.now();
  const slots: Slot[] = [];

  for (const date of eachDateInclusive(from, to)) {
    const weekday = parisWeekdayIndex(date);
    if (weekday === 0) continue;

    for (let hour = 10; hour < 19; hour += 1) {
      const tariff = tariffForHour(hour);
      if (!tariff) continue;

      const { starts_at, ends_at } = slotIso(date, hour);
      const startsMs = new Date(starts_at).getTime();
      let state: Slot['state'] = 'open';
      let taken = 0;

      if (startsMs < now) {
        state = 'past';
      } else if (isBlockedEducational(date, hour, clubId)) {
        state = 'blocked';
      } else if (hour === 12) {
        state = 'full';
        taken = CAPACITY;
      } else {
        taken = hour === 18 ? 1 : 0;
      }

      slots.push({
        starts_at,
        ends_at,
        amount_cents: amountForTariff(tariff),
        tariff,
        capacity: CAPACITY,
        taken,
        state,
      });
    }
  }

  return {
    club_id: clubId,
    space_id: space?.id,
    slots,
  };
}
