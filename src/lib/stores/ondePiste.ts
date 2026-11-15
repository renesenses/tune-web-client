/**
 * L'enveloppe de la piste en lecture pour la barre de progression en forme
 * d'onde (Discussion #8269) — voir `lib/barreOnde.ts`. Un seul store partagé
 * par l'écran de lecture et la barre du bas, un seul cache pour l'onglet.
 */
import { derived } from 'svelte/store';
import { getTrackWaveform } from '../api';
import { creerCacheOndes, ondeDeLaPiste } from '../barreOnde';
import { preferences } from './preferences';
import { currentTrack } from './nowPlaying';

export const cacheOndes = creerCacheOndes(getTrackWaveform);

export const barreOndeActive = derived(preferences, ($p) => $p.barreOnde === true);

export const ondePisteEnCours = ondeDeLaPiste(barreOndeActive, currentTrack, cacheOndes);
