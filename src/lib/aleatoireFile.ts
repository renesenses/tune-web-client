/**
 * Le bouton Aléatoire, une fois pour toutes ses surfaces —
 * `renesenses/tune-server-rust#6526`.
 *
 * Depuis #6526, `POST /zones/{id}/shuffle` ne se contente plus d'armer un
 * mode : le serveur RÉORDONNE la file (la suite du titre en cours est rebattue,
 * l'ordre d'origine revient quand on éteint). La file affichée doit donc être
 * relue tout de suite après la bascule, sinon l'écran montre l'ancien ordre
 * alors que la zone joue le nouveau — exactement le défaut que #6526 referme.
 *
 * `playback.shuffle` fait déjà recharger la file (`rechargementFile.ts`), mais
 * l'événement peut se perdre (WebSocket coupé, client passé en sondage de
 * repli, qui ne relit que `/zones`). La réponse de la bascule fait foi : on
 * relit la file dès qu'elle est arrivée, pour la zone affichée.
 *
 * La barre de lecture, « Lecture en cours », la carte de zone et l'écran File
 * d'attente passent tous par ici.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { queueLength, queuePosition, queueTracks } from './stores/queue';
import { currentZoneId } from './stores/zones';
import type { Track } from './types';

/** Les gestes serveur dont dépend la bascule, injectables pour les tests. */
export interface PortesAleatoire {
  basculer: (zoneId: number, enabled: boolean) => Promise<api.ReponseAleatoire>;
  lireFile: (
    zoneId: number,
  ) => Promise<{ tracks?: Track[]; position?: number; length?: number }>;
  zoneAffichee: () => number | null;
}

const PORTES: PortesAleatoire = {
  basculer: (zoneId, enabled) => api.setShuffle(zoneId, enabled),
  lireFile: (zoneId) => api.getQueue(zoneId),
  zoneAffichee: () => get(currentZoneId),
};

/**
 * Bascule l'aléatoire de la zone et rend l'état RETENU par le serveur.
 *
 * La file n'est relue que pour la zone affichée (les magasins de file ne
 * portent qu'elle), et seulement si le serveur n'a pas dit qu'il n'avait rien
 * réordonné — un serveur plus ancien ne le dit pas, et on relit alors par
 * prudence. Une relecture qui échoue garde la file précédente : elle sera
 * corrigée par l'événement suivant, et la bascule, elle, a réussi.
 */
export async function basculerAleatoire(
  zoneId: number,
  enabled: boolean,
  portes: PortesAleatoire = PORTES,
): Promise<boolean> {
  const r = await portes.basculer(zoneId, enabled);
  if (r.queue_reordered !== false && portes.zoneAffichee() === zoneId) {
    try {
      const q = await portes.lireFile(zoneId);
      const pistes = q.tracks ?? [];
      queueTracks.set(pistes);
      queuePosition.set(q.position ?? 0);
      queueLength.set(q.length ?? pistes.length);
    } catch {
      /* affichage seul : la bascule a réussi */
    }
  }
  return r.shuffle;
}
