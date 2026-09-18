'use client';

import { useRouter } from 'next/navigation';
import type { Space } from '@/lib/api/types';

type Props = {
  clubId: string;
  spaces: Space[];
  spaceId?: string;
  from: string;
  to: string;
};

export function ClubSlotsToolbar({ clubId, spaces, spaceId, from, to }: Props) {
  const router = useRouter();

  function navigate(next: { space_id?: string; from?: string; to?: string }) {
    const q = new URLSearchParams({
      from: next.from ?? from,
      to: next.to ?? to,
    });
    const sid = next.space_id ?? spaceId;
    if (sid) q.set('space_id', sid);
    router.push(`/clubs/${clubId}?${q.toString()}`);
  }

  return (
    <form
      className="slot-toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        navigate({
          space_id: String(fd.get('space_id') || ''),
          from: String(fd.get('from') || from),
          to: String(fd.get('to') || to),
        });
      }}
    >
      {spaces.length > 1 ? (
        <label>
          Espace
          <select name="space_id" defaultValue={spaceId} key={spaceId}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="space_id" value={spaceId ?? ''} />
      )}
      <label>
        Du
        <input type="date" name="from" defaultValue={from} required />
      </label>
      <label>
        Au
        <input type="date" name="to" defaultValue={to} required />
      </label>
      <button type="submit" className="btn btn-primary">
        Afficher
      </button>
    </form>
  );
}
