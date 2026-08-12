import { writable, derived } from 'svelte/store';
import type { Track } from '../types';

export const queueTracks = writable<Track[]>([]);
export const queuePosition = writable<number>(0);
export const queueLength = writable<number>(0);

/** Next 5 tracks after the current position */
export const upNextTracks = derived(
  [queueTracks, queuePosition],
  ([$tracks, $pos]) => $tracks.slice($pos + 1, $pos + 6)
);

/**
 * Résumé « à suivre » : combien de titres après celui qui joue, et pour
 * combien de temps.
 *
 * L'en-tête de file affichait le total de la file, qui ne bouge pas d'un pouce
 * pendant qu'on écoute : au onzième titre d'un album de onze, elle annonçait
 * toujours « 11 titres ». Suggestion de Dominique COMET, déjà appliquée à la
 * vue File — ces deux dérivés sortent le calcul de `QueueView` pour que
 * l'écran Lecture en cours, qu'il nommait explicitement, dise la même chose
 * sans en réécrire une seconde version.
 *
 * Une piste sans durée connue (radio, flux) compte pour zéro : mieux vaut
 * annoncer un temps un peu court qu'inventer une durée.
 */
export const upNextCount = derived(
  [queueTracks, queuePosition],
  ([$tracks, $pos]) => Math.max(0, $tracks.length - ($pos + 1))
);

export const upNextMs = derived([queueTracks, queuePosition], ([$tracks, $pos]) =>
  $tracks.slice($pos + 1).reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
);
