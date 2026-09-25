import { writable, derived } from 'svelte/store';
import * as api from '../api';

/**
 * Ce que `GET /api/v1/plugins` dit du greffon « Playlists converter », pour
 * les seuls champs qu'on lit. Un greffon WASM y figure dès qu'il est posé sur
 * le disque (`routes/plugins.rs`, boucle wasm) :
 *   `{name, type: "wasm", installed: true, enabled, loaded, restart_required, …}`.
 *
 * Même forme de magasin que Bandcamp et Concerts, et pour la même raison :
 * `api.InstalledPlugin` décrit un contrat plus ancien (`status`) que cette
 * route n'emploie plus.
 */
export interface EtatGreffonConvertisseur {
  name: string;
  type?: string;
  version?: string;
  installed?: boolean;
  /** Le réglage `plugin_playlists-converter_enabled` n'est pas à `false`. */
  enabled?: boolean;
  /** Le greffon est chargé dans le registre wasm : ses routes RÉPONDENT. */
  loaded?: boolean;
}

/** `null` tant qu'on n'a pas répondu : on ne conclut rien d'une absence de réponse. */
export const convertisseurGreffon = writable<EtatGreffonConvertisseur | null | 'absent'>(null);

/**
 * Les onglets du greffon peuvent-ils s'afficher ?
 *
 * Il faut les TROIS : installé, activé, et CHARGÉ. Un greffon installé depuis
 * le dernier démarrage est listé (`loaded: false`, `restart_required: true`)
 * mais ses routes ne sont pas montées : chaque appel rendrait le 404
 * « plugin not found » de l'hôte. Un serveur compilé sans `plugins-wasm` le
 * liste aussi, `loaded: false` en dur. Dans tous ces cas les onglets restent
 * masqués, comme avant le greffon.
 */
export const convertisseurCharge = derived(
  convertisseurGreffon,
  ($g) =>
    $g !== null &&
    $g !== 'absent' &&
    $g.installed !== false &&
    $g.enabled === true &&
    $g.loaded === true,
);

/** Interroger le serveur. Silencieux en cas d'échec : un serveur ancien ou hors ligne ne doit rien faire clignoter. */
export async function rafraichirConvertisseur(): Promise<void> {
  try {
    const liste = (await api.getInstalledPlugins()) as unknown as EtatGreffonConvertisseur[];
    const g = Array.isArray(liste) ? liste.find((p) => p?.name === api.GREFFON_CONVERTISSEUR) : undefined;
    convertisseurGreffon.set(g ?? 'absent');
  } catch {
    // On garde l'état précédent : indéterminé ne vaut pas « absent ».
  }
}
