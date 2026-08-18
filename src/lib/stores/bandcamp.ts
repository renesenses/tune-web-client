import { writable, derived } from 'svelte/store';
import * as api from '../api';

/** Ce que `/api/v1/plugins` dit d'une entrée, pour les champs qui nous
 *  intéressent.
 *
 *  `api.InstalledPlugin` ne les déclare pas — il décrit une forme plus
 *  ancienne (`status`) que cette route n'emploie pas. Plutôt que d'élargir un
 *  type partagé pour un seul appelant, on nomme ici le contrat qu'on lit
 *  vraiment.
 */
export interface EtatPluginBandcamp {
  name: string;
  version?: string;
  /** Le réglage `plugin_bandcamp_installed` est posé. */
  installed?: boolean;
  /** Le plugin tourne : son routeur est monté sous `/api/v1/ext/bandcamp`. */
  enabled?: boolean;
}

/** Le plugin Bandcamp est-il présent dans CE binaire, et dans quel état ?
 *
 *  `null` tant qu'on n'a pas répondu — on ne conclut rien d'une absence de
 *  réponse.
 */
export const bandcampPlugin = writable<EtatPluginBandcamp | null | 'absent'>(null);

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

/** Le plugin tourne-t-il RÉELLEMENT, c'est-à-dire ses routes sont-elles
 *  montées ?
 *
 *  Distinction que `bandcampUsable` ne fait pas, et dont l'absence a coûté une
 *  soirée : un plugin peut figurer dans la liste sans que son routeur existe.
 *  Les routeurs de plugins sont montés **une seule fois, au démarrage**
 *  (`plugins::init` → `nest_service`) ; cliquer « Installer » écrit un réglage
 *  en base et ne remonte rien dans le serveur qui tourne. Entre les deux,
 *  chaque appel à `/api/v1/ext/bandcamp/…` répond le 404 nu d'axum — sans
 *  corps JSON, puisque le service imbriqué possède tout ce qui est sous son
 *  préfixe.
 *
 *  `enabled` est le seul champ qui tranche : le serveur ne le met à `true` que
 *  pour les plugins effectivement chargés ; ceux qui sont compilés mais
 *  dormants sont listés avec `enabled: false` en dur.
 */
export const bandcampCharge = derived(
  bandcampPlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.enabled === true,
);

/** Le plugin est là et installé, mais il attend un redémarrage du serveur. */
export const bandcampAttendRedemarrage = derived(
  bandcampPlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.enabled !== true && $p.installed === true,
);

/** Interroger le serveur une fois. Silencieux en cas d'échec : un serveur
 *  antérieur, ou hors ligne, ne doit pas faire clignoter le menu. */
export async function refreshBandcampPlugin(): Promise<void> {
  try {
    const plugins = (await api.getInstalledPlugins()) as unknown as EtatPluginBandcamp[];
    const bc = plugins.find((p) => p.name === 'bandcamp');
    bandcampPlugin.set(bc ?? 'absent');
  } catch {
    // On garde `null` : indéterminé, donc pas d'entrée — mieux vaut une
    // fonction qu'on n'a pas encore vue qu'une porte qui ne s'ouvre pas.
  }
}
