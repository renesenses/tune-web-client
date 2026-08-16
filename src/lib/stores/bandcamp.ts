import { writable, derived } from 'svelte/store';
import * as api from '../api';

/** Le plugin Bandcamp est-il présent dans CE binaire, et dans quel état ?
 *
 *  `null` tant qu'on n'a pas répondu — on ne conclut rien d'une absence de
 *  réponse.
 */
export const bandcampPlugin = writable<api.InstalledPlugin | null | 'absent'>(null);

/** L'entrée Bandcamp doit-elle figurer dans la navigation ?
 *
 *  Même règle que l'entrée Ambiance : on ne masque QUE le cas où l'utilisateur
 *  ne peut rien y faire — un binaire qui n'embarque pas le plugin. S'il est là
 *  mais pas encore installé, l'entrée reste visible et l'écran explique le
 *  geste, plutôt que de faire disparaître une fonction qu'on vient d'annoncer.
 *
 *  Sans ce store, l'écran existait mais AUCUN chemin n'y menait : la vue était
 *  déclarée et aiguillée, sans bouton pour l'atteindre. Ni `svelte-check`, ni
 *  la vérification i18n, ni les tests ne peuvent voir ça — une route sans porte
 *  d'entrée compile parfaitement (#1768).
 */
export const bandcampUsable = derived(bandcampPlugin, ($p) => $p !== null && $p !== 'absent');

/** Interroger le serveur une fois. Silencieux en cas d'échec : un serveur
 *  antérieur, ou hors ligne, ne doit pas faire clignoter le menu. */
export async function refreshBandcampPlugin(): Promise<void> {
  try {
    const plugins = await api.getInstalledPlugins();
    const bc = plugins.find((p) => p.name === 'bandcamp');
    bandcampPlugin.set(bc ?? 'absent');
  } catch {
    // On garde `null` : indéterminé, donc pas d'entrée — mieux vaut une
    // fonction qu'on n'a pas encore vue qu'une porte qui ne s'ouvre pas.
  }
}
