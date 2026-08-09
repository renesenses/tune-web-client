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

/** L'entrée Ambiance doit-elle figurer dans la navigation ?
 *
 *  On ne masque QUE le cas où l'utilisateur ne peut rien y faire : un binaire
 *  sans la brique acoustique. Partout ailleurs l'entrée reste visible, et
 *  l'écran explique ce qu'il faut activer — avec le geste sur place.
 *
 *  La première version masquait aussi quand l'analyse était désactivée. C'était
 *  éviter une porte fermée, mais l'effet fut pire : un menu connu disparaissait
 *  sans prévenir, et deux testeurs ont cru la fonction supprimée en moins d'un
 *  jour (Fabien, Philippe). Un silence en avait remplacé un autre.
 *
 *  Tant que le serveur n'a pas répondu (`null`), on n'affiche pas : mieux vaut
 *  une entrée qui apparaît qu'une entrée qui disparaît sous le curseur. */
export const ambianceUsable = derived(
  acousticStatus,
  ($s) => $s !== null && $s.available,
);

/** L'analyse est-elle activée ? L'écran Ambiance s'en sert pour choisir entre
 *  « à activer » et « en cours ». */
export const acousticEnabled = derived(
  acousticStatus,
  ($s) => $s?.enabled === true,
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
