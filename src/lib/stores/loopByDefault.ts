import { writable } from 'svelte/store';

// "Lire en boucle par défaut" (Elie): when on, starting playback sets the zone
// to repeat-one so a finished track restarts from the beginning. Client-side
// preference, persisted in localStorage.
const KEY = 'tune_loop_by_default';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export const loopByDefault = writable<boolean>(load());

loopByDefault.subscribe((v) => {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* private mode / storage disabled — in-memory only */
  }
});
