/**
 * L'enveloppe de la piste en lecture pour la barre de progression en forme
 * d'onde (Discussion #8269) — voir `lib/barreOnde.ts`. Un seul store partagé
 * par l'écran de lecture et la barre du bas, un seul cache pour l'onglet.
 */
import { derived } from 'svelte/store';
import { getServiceTrackWaveform, getTrackWaveform } from '../api';
import { POINTS_ONDE_FIN, creerCacheOndes, ondeDeLaPiste, pisteDeServiceDe, type ClePiste } from '../barreOnde';
import { preferences } from './preferences';
import { currentTrack, playbackState } from './nowPlaying';

/** Une piste locale par son identifiant de bibliothèque ; une piste Qobuz
 *  ou TIDAL par son service et son identifiant chez lui. */
export function chargerOnde(cle: ClePiste): Promise<unknown> {
  if (typeof cle === 'number') return getTrackWaveform(cle, POINTS_ONDE_FIN);
  const p = pisteDeServiceDe(cle);
  return p ? getServiceTrackWaveform(p.service, p.id) : Promise.resolve(null);
}

export const cacheOndes = creerCacheOndes(chargerOnde);

export const barreOndeActive = derived(preferences, ($p) => $p.barreOnde === true);

/** Réglage « Forme d'onde des pistes de streaming » (décision du 17/11,
 *  option C) : décoché, aucune requête pour une piste Qobuz ou TIDAL. */
export const ondeStreamingActive = derived(preferences, ($p) => $p.ondeStreaming === true);

/** La zone joue : la reprise relance les demandes épuisées pendant une pause. */
export const zoneEnLecture = derived(playbackState, ($s) => $s === 'playing');

export const ondePisteEnCours = ondeDeLaPiste(
  barreOndeActive, currentTrack, cacheOndes, ondeStreamingActive, zoneEnLecture,
);
