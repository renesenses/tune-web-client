import { writable, derived } from 'svelte/store';
import * as api from '../api';

/** État de la brique acoustique côté serveur, tel que renvoyé par
 *  `GET /library/search/acoustic/status`. `null` tant qu'on n'a pas répondu. */
export interface AcousticStatus {
  available: boolean;
  enabled: boolean;
  analysed_tracks: number;
}

export const acousticStatus = writable<AcousticStatus | null>(null);

/** L'écran Ambiance a-t-il une chance de servir ?
 *
 *  On garde l'entrée visible dès que l'analyse est activée, même à zéro piste :
 *  quelqu'un qui vient de l'activer verrait sinon le menu disparaître sans
 *  comprendre. On ne la masque que quand rien ne pourra jamais aboutir — binaire
 *  sans la brique acoustique, ou analyse désactivée.
 *
 *  Tant que le serveur n'a pas répondu (`null`), on n'affiche pas : mieux vaut
 *  une entrée qui apparaît qu'une entrée qui disparaît sous le curseur. */
export const ambianceUsable = derived(
  acousticStatus,
  ($s) => $s !== null && $s.available && $s.enabled,
);

/** Recharge l'état. Appelé au démarrage et après bascule de l'interrupteur
 *  dans les Paramètres, pour que la navigation suive sans rechargement. */
export async function refreshAcousticStatus(): Promise<void> {
  try {
    acousticStatus.set(await api.getAcousticStatus());
  } catch {
    // Serveur plus ancien (route absente) ou hors ligne : on reste sur `null`,
    // donc l'entrée reste masquée plutôt que de promettre ce qu'on ne sait pas.
    acousticStatus.set(null);
  }
}
