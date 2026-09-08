import { writable, derived } from 'svelte/store';
import { currentZone, currentZoneId } from './zones';
import type { NowPlaying, PlaybackState, Source, Track } from '../types';

// Seek position in milliseconds
export const seekPositionMs = writable<number>(0);

// Shuffle as a separate store (set via API, updated via WS)
export const shuffleEnabled = writable<boolean>(false);

// repeatMode lives in a leaf module (repeatStore) to break the
// zones ↔ nowPlaying import cycle; re-export it so existing importers of
// `./nowPlaying` keep working.
export { repeatMode } from './repeatStore';

// Mute: stores the pre-mute volume (null = not muted)
export const mutedVolume = writable<number | null>(null);

// Derived from current zone
export const currentTrack = derived(currentZone, ($zone) => $zone?.current_track ?? null);

/** Id de bibliothèque de la piste en lecture, ou null (radio / piste streaming).
 *
 *  `current_track` n'a pas la même forme selon la route qui a rempli le store :
 *  `GET /zones` sérialise la structure interne du serveur, dont le champ est
 *  `track_id` (zones.rs), tandis que `/zones/{id}/state` construit son JSON à la
 *  main et le nomme `id` (playback.rs). Comparer `$currentTrack.id` échoue donc
 *  silencieusement sur la forme la plus courante — passer par ce store plutôt
 *  que de relire le champ à la main. */
export const currentTrackId = derived(
  currentTrack,
  ($track) => $track?.track_id ?? $track?.id ?? null,
);

/** La piste `t` est-elle celle qui joue ?
 *
 *  Deux clés, parce qu'il y a deux natures de piste :
 *  - une piste de bibliothèque se reconnaît à son identifiant. Le garde
 *    `!= null` est indispensable : sans lui, toutes les pistes sans
 *    identifiant se surligneraient ensemble ;
 *  - une piste en streaming n'a pas d'entrée en bibliothèque. Le serveur
 *    envoie alors `source` et `source_id` (`NowPlaying`, playback/mod.rs) :
 *    c'est la seule clé commune avec la ligne affichée.
 *
 *  Les deux comparaisons sont indépendantes ; aucune ne devine quoi que ce
 *  soit à partir du titre ou de l'artiste. Si le serveur n'envoie ni
 *  identifiant ni `source_id`, rien n'est surligné — pas de faux positif.
 *
 *  Écrit pour les vues Playlists, où la piste en cours n'était pas mise en
 *  évidence du tout (Bertrand, .18, 0.9.102) alors que la bibliothèque le fait
 *  depuis toujours. */
export function estLaPisteEnLecture(
  t: { id?: number | null; source?: Source | null; source_id?: string | null },
  currentId: number | null,
  np: NowPlaying | null,
): boolean {
  if (t.id != null && currentId != null && t.id === currentId) return true;
  if (t.source_id != null && np?.source_id != null && t.source_id === np.source_id) {
    // La source doit concorder quand les deux la portent : deux services
    // peuvent numéroter une piste pareil.
    if (t.source != null && np.source != null && t.source !== np.source) return false;
    return true;
  }
  return false;
}

/**
 * Ce qu'une LIGNE de liste doit annoncer pour la piste `t` (#1845).
 *
 * `null` : cette ligne n'est pas la lecture en cours, elle ne dit rien.
 */
export type EtatLigne = 'lecture' | 'pause' | 'arret' | null;

/**
 * L'état à afficher sur la ligne de `t` — reconnaissance ET état du transport.
 *
 * ## Pourquoi une fonction, et pas `id === $currentTrackId`
 *
 * Le nouveau client comparait les identifiants à la main, à quatre endroits.
 * Deux conséquences, toutes deux visibles :
 *
 *  - une piste de STREAMING n'a pas d'identifiant local : aucune ligne n'était
 *    marquée dans les résultats de recherche Qobuz ou Tidal, ni dans une
 *    playlist de service. `estLaPisteEnLecture` connaît la seconde clé, la
 *    paire `source` + `source_id` ;
 *  - l'état du transport n'entrait pas dans le calcul : une piste MISE EN
 *    PAUSE restait affichée comme si elle jouait. C'est précisément le cas que
 *    demandait #1845 — « prévois le cas d'une piste en pause ».
 *
 * ## Pourquoi `stopped` reste marqué
 *
 * Une zone arrêtée pointe toujours sur sa piste, et c'est là que l'utilisateur
 * a laissé son écoute. Retirer le repère à l'arrêt lui ferait perdre sa place
 * au moment même où il la cherche — le défaut que ce ticket corrige. On le
 * garde donc, mais on le NOMME autrement : « arrêtée », pas « en pause ».
 */
export function etatDeLaLigne(
  t: { id?: number | null; source?: Source | null; source_id?: string | null },
  currentId: number | null,
  np: NowPlaying | null,
  etat: PlaybackState | null | undefined,
): EtatLigne {
  if (!estLaPisteEnLecture(t, currentId, np)) return null;
  if (etat === 'playing') return 'lecture';
  if (etat === 'paused') return 'pause';
  return 'arret';
}

/** Convertit le now-playing d'une zone en `Track` de bibliothèque.
 *
 *  À passer à tout code qui attend un `Track` : le serveur nomme l'id
 *  `track_id`, si bien qu'un `NowPlaying` transmis tel quel arrive avec un `id`
 *  absent. C'est ce qui cassait l'ajout d'une piste locale à une playlist depuis
 *  le plein écran (AddToPlaylistModal teste `track.id`, retombait sur la branche
 *  streaming et envoyait un `source_id` nul) et la déduplication de
 *  l'historique, qui compare `id` puis `file_path`.
 *
 *  Les champs que le serveur n'envoie pas — `album_id`, `artist_id`, `channels`,
 *  `file_path` — restent absents : cette fonction rétablit l'id, elle n'invente
 *  rien. */
export function nowPlayingToTrack(np: NowPlaying | Track): Track {
  const t = np as NowPlaying & Track;
  return { ...t, id: t.track_id ?? t.id ?? null };
}
export const playbackState = derived(currentZone, ($zone): PlaybackState => ($zone?.state as PlaybackState) ?? 'stopped');
const _zoneVol = writable<number>(0.5);
let _volLocalUntil = 0;
currentZoneId.subscribe(() => { _volLocalUntil = 0; });
currentZone.subscribe(($zone) => {
  if ($zone?.volume !== undefined && Date.now() > _volLocalUntil) {
    const v = $zone.volume > 1 ? $zone.volume / 100 : $zone.volume;
    _zoneVol.set(v);
  }
});
export const zoneVolume = {
  subscribe: _zoneVol.subscribe,
  set(v: number) { _volLocalUntil = Date.now() + 2000; _zoneVol.set(v); },
  update(fn: (v: number) => number) { _volLocalUntil = Date.now() + 2000; _zoneVol.update(fn); },
};

// Seek interpolation timer (smooth 200ms ticks for fluid progress bar)
let seekTimer: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 200;

export function startSeekTimer() {
  if (seekTimer) return; // already running
  seekTimer = setInterval(() => {
    seekPositionMs.update((pos) => pos + TICK_MS);
  }, TICK_MS);
}

export function stopSeekTimer() {
  if (seekTimer) {
    clearInterval(seekTimer);
    seekTimer = null;
  }
}
