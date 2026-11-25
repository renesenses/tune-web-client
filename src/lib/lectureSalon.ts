/**
 * Les gestes de lecture de l'interface « Salon » — tous sur la zone courante,
 * par les mêmes chemins que l'interface actuelle (`playAndSync`,
 * `addToQueue`, `rangLireEnsuite`). Un échec passe par `signalerEchecLecture`,
 * le bandeau commun.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { currentZone, playAndSync } from './stores/zones';
import { rangLireEnsuite } from './stores/queue';
import { signalerEchecLecture } from './echecLecture';
import { notifications } from './stores/notifications';
import { t } from './i18n';

function zoneOuAvis(): number | null {
  const id = get(currentZone)?.id ?? null;
  if (id == null) notifications.error(get(t)('salon.aucuneZone' as any));
  return id;
}

function lancer(p: Promise<unknown>): void {
  p.catch(signalerEchecLecture);
}

export function lireAlbum(albumId: number, opts: { depuis?: number; aleatoire?: boolean } = {}): void {
  const zid = zoneOuAvis();
  if (zid == null) return;
  lancer(playAndSync(zid, {
    album_id: albumId,
    start_index: opts.depuis ?? 0,
    context_type: 'album',
    context_id: String(albumId),
    ...(opts.aleatoire ? { context_shuffle: true } : {}),
  }));
}

export function lireArtiste(artistId: number, opts: { aleatoire?: boolean } = {}): void {
  const zid = zoneOuAvis();
  if (zid == null) return;
  lancer(playAndSync(zid, {
    artist_id: artistId,
    context_type: 'artist',
    context_id: String(artistId),
    ...(opts.aleatoire ? { context_shuffle: true } : {}),
  }));
}

export function lirePistes(trackIds: number[], opts: { aleatoire?: boolean } = {}): void {
  const zid = zoneOuAvis();
  if (zid == null || !trackIds.length) return;
  const ids = opts.aleatoire ? [...trackIds].sort(() => Math.random() - 0.5) : trackIds;
  lancer(playAndSync(zid, { track_ids: ids }));
}

/** À la suite du titre en cours (`ensuite`) ou en fin de file. */
export function ajouterAlbumALaFile(albumId: number, ou: 'ensuite' | 'fin'): void {
  const zid = zoneOuAvis();
  if (zid == null) return;
  lancer(api.addToQueue(zid, {
    album_id: albumId,
    context_type: 'album',
    context_id: String(albumId),
    ...(ou === 'ensuite' ? { position: rangLireEnsuite() } : {}),
  }).then(() => notifications.success(get(t)('salon.ajouteALaFile' as any))));
}

/** Toute la bibliothèque (ou un genre, un artiste) au hasard, par le serveur. */
export function lireAuHasard(opts: { genre?: string; artist_id?: number } = {}): void {
  const zid = zoneOuAvis();
  if (zid == null) return;
  lancer(api.shuffleAll(zid, opts));
}
