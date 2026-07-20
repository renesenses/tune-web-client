import { get } from 'svelte/store';
import { currentZone, playAndSync } from './stores/zones';

/** Play an ordered list of LOCAL tracks starting at `index` (Play from here). */
export async function playFromHere(tracks: Array<{ id?: number | null }>, index: number): Promise<void> {
  const zone = get(currentZone);
  if (!zone) return;
  const ids = tracks.map(t => t?.id).filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) return;
  const targetId = tracks[index]?.id;
  const startIndex = typeof targetId === 'number' ? Math.max(0, ids.indexOf(targetId)) : 0;
  await playAndSync(zone.id, { track_ids: ids, start_index: startIndex });
}
