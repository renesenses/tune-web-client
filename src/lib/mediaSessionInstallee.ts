// tune-server-rust#4908 — le branchement réel de `mediaSession.ts` : la zone
// affichée, les commandes de la barre de lecture, les pochettes du serveur.
// Séparé du module testé pour que ses témoins ne chargent pas les magasins.

import { get } from 'svelte/store';
import * as api from './api';
import { brancherSessionMedia, controlesEcranVerrouille } from './mediaSession';
import { togglePlayPause } from './playback-controls';
import { currentZone, nextAndSync, previousAndSync } from './stores/zones';

/** Lecture ou pause sur la zone affichée, par le même chemin que la barre. */
async function basculerSi(attendu: 'joue' | 'arrete'): Promise<void> {
  const z = get(currentZone);
  const joue = z?.state === 'playing' || z?.state === 'buffering';
  if ((attendu === 'joue') !== joue) return;
  await togglePlayPause(z, z?.current_track ?? null, z?.state ?? 'stopped');
}

export function installerSessionMedia(): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => {};
  return brancherSessionMedia(
    navigator.mediaSession,
    currentZone,
    controlesEcranVerrouille,
    {
      lire: () => basculerSi('arrete'),
      pause: () => basculerSi('joue'),
      suivant: (id) => nextAndSync(id),
      precedent: (id) => previousAndSync(id),
      chercher: (id, ms) => api.seek(id, ms),
    },
    (chemin) => api.artworkUrl(chemin, 512),
    (m) => new MediaMetadata(m),
  );
}
