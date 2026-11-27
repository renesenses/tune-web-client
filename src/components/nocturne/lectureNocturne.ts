/**
 * Gestes de lecture de Nocturne — de fines enveloppes sur les MÊMES chemins
 * que la coquille v2 (`playAndSync`, `api.addToQueue`, `rangLireEnsuite`),
 * pour qu'un geste se comporte à l'identique quelle que soit l'interface.
 */
import { get } from 'svelte/store';
import * as api from '../../lib/api';
import { t } from '../../lib/i18n';
import { currentZoneId, playAndSync } from '../../lib/stores/zones';
import { rangLireEnsuite, queueTracks, queuePosition } from '../../lib/stores/queue';
import { notifications } from '../../lib/stores/notifications';
import { signalerEchecLecture } from '../../lib/echecLecture';

function zone(): number | null {
  const zid = get(currentZoneId);
  if (zid == null) notifications.error(get(t)('v2.art.noZone'));
  return zid;
}

/** Lit un album depuis le début, ou depuis la piste `depuis` (rang 0). */
export function lireAlbum(albumId: number, depuis = 0, melange = false): void {
  const zid = zone();
  if (zid == null) return;
  playAndSync(zid, { album_id: albumId, start_index: depuis, ...(melange ? { context_shuffle: true } : {}) })
    .catch(signalerEchecLecture);
}

/** Lit une liste de pistes (titres populaires d'un artiste), depuis la piste `depuis`. */
export function lirePistes(trackIds: number[], depuis = 0): void {
  const zid = zone();
  if (zid == null || !trackIds.length) return;
  playAndSync(zid, { track_ids: trackIds, start_index: depuis }).catch(signalerEchecLecture);
}

/** Lit toute la discographie locale d'un artiste. */
export function lireArtiste(artistId: number): void {
  const zid = zone();
  if (zid == null) return;
  playAndSync(zid, { artist_id: artistId }).catch(signalerEchecLecture);
}

/** « Lire ensuite » (`ensuite`) ou « Ajouter à la file » (fin). */
export async function enfilerAlbum(albumId: number, ensuite: boolean): Promise<void> {
  const zid = zone();
  if (zid == null) return;
  try {
    await api.addToQueue(zid, { album_id: albumId, ...(ensuite ? { position: rangLireEnsuite() } : {}) });
    void rechargerFileNocturne();
  } catch (e) {
    signalerEchecLecture(e);
  }
}

/** Ajoute une piste en fin de file, ou juste après la piste en cours (`ensuite`). */
export async function enfilerPiste(trackId: number, ensuite = false): Promise<void> {
  const zid = zone();
  if (zid == null) return;
  try {
    await api.addToQueue(zid, { track_id: trackId, ...(ensuite ? { position: rangLireEnsuite() } : {}) });
    void rechargerFileNocturne();
  } catch (e) {
    signalerEchecLecture(e);
  }
}

/** Relit la file de la zone courante dans les magasins partagés. */
export async function rechargerFileNocturne(): Promise<void> {
  const zid = get(currentZoneId);
  if (zid == null) return;
  try {
    const qs = await api.getQueue(zid);
    if (get(currentZoneId) !== zid) return;
    queueTracks.set(qs.tracks ?? []);
    queuePosition.set(qs.position ?? 0);
  } catch {
    /* le WebSocket rattrapera */
  }
}
