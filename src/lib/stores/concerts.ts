import { writable, derived } from 'svelte/store';
import * as api from '../api';

/** Ce que `/api/v1/plugins` dit du greffon concerts, pour les seuls champs
 *  qu'on lit vraiment. Même forme que pour Bandcamp — et pour la même raison :
 *  `api.InstalledPlugin` décrit un contrat plus ancien (`status`) que cette
 *  route n'emploie pas.
 */
export interface EtatPluginConcerts {
  name: string;
  version?: string;
  /** Le réglage `plugin_concerts_installed` est posé. */
  installed?: boolean;
  /** Le greffon tourne : son routeur est monté sous `/api/v1/ext/concerts`. */
  enabled?: boolean;
  /** Le module Premium exigé, tel que la grille des modules l'affiche.
   *
   *  Le serveur le rend depuis tune-server-rust#2933, pour qu'on puisse
   *  montrer le cadenas AVANT le clic : sans lui, l'utilisateur installe,
   *  redémarre, et n'obtient qu'un 402.
   */
  required_feature?: string;
}

/** Le greffon est-il présent dans CE binaire, et dans quel état ?
 *
 *  `null` tant qu'on n'a pas répondu : on ne conclut rien d'une absence de
 *  réponse.
 */
export const concertsPlugin = writable<EtatPluginConcerts | null | 'absent'>(null);

/** L'entrée « Concerts » doit-elle figurer dans la navigation ?
 *
 *  On ne masque QUE le cas où l'utilisateur ne peut rien y faire : un binaire
 *  qui n'embarque pas le greffon. S'il est là mais pas installé, l'entrée reste
 *  visible et l'écran explique le geste — faire disparaître une fonction qu'on
 *  vient d'annoncer est pire que de l'expliquer.
 *
 *  ⚠️ Un écran sans porte d'entrée compile parfaitement : ni `svelte-check`, ni
 *  la vérification i18n, ni les tests ne voient une vue déclarée et aiguillée
 *  qu'aucun bouton n'atteint. C'est arrivé à Bandcamp (#1768).
 */
export const concertsUtilisable = derived(
  concertsPlugin,
  ($p) => $p !== null && $p !== 'absent',
);

/** Le greffon tourne-t-il RÉELLEMENT, c'est-à-dire ses routes sont-elles
 *  montées ?
 *
 *  Distinction que `concertsUtilisable` ne fait pas. Les routeurs de greffons
 *  sont montés **une seule fois, au démarrage** : cliquer « Installer » écrit un
 *  réglage en base et ne remonte rien dans le serveur qui tourne. Entre les
 *  deux, chaque appel répond le 404 nu d'axum — sans corps JSON, puisque le
 *  service imbriqué possède tout ce qui est sous son préfixe.
 */
export const concertsCharge = derived(
  concertsPlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.enabled === true,
);

/** Installé, mais le serveur n'a pas encore redémarré. */
export const concertsAttendRedemarrage = derived(
  concertsPlugin,
  ($p) => $p !== null && $p !== 'absent' && $p.enabled !== true && $p.installed === true,
);

/** Interroger le serveur une fois. Silencieux en cas d'échec : un serveur
 *  antérieur, ou hors ligne, ne doit pas faire clignoter le menu. */
export async function refreshConcertsPlugin(): Promise<void> {
  try {
    const plugins = (await api.getInstalledPlugins()) as unknown as EtatPluginConcerts[];
    const c = plugins.find((p) => p.name === 'concerts');
    concertsPlugin.set(c ?? 'absent');
  } catch {
    // On garde `null` : indéterminé, donc pas d'entrée — mieux vaut une
    // fonction qu'on n'a pas encore vue qu'une porte qui ne s'ouvre pas.
  }
}
