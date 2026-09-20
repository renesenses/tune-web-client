/**
 * L'ÉGALISEUR EST-IL INSTALLÉ ? — Bertrand, 20/09/2026 : « Je n'ai pas
 * d'Equaliseur. Pourquoi cette mention de EQ ici ? », capture de Lecture en
 * cours à l'appui.
 *
 * Depuis la **v0.9.156**, l'égaliseur est un greffon FACULTATIF : la migration
 * ne pose plus `plugin_equalizer_installed`, et le réglage ne passe à `true`
 * qu'après un `POST /plugins/equalizer/install` explicite
 * (`tune-core/src/audio/premium_plugins.rs`). Or le client ne posait la
 * question nulle part — aucune occurrence de `plugin_equalizer_installed` dans
 * tout le dépôt web — et offrait le bouton à tout le monde.
 *
 * Même forme que `stores/concerts` et `stores/bandcamp`, et pour la même
 * raison : `api.InstalledPlugin` décrit un contrat plus ancien (`status`) que
 * la route `/api/v1/plugins` n'emploie pas.
 */
import { writable, derived } from 'svelte/store';
import * as api from '../api';

export interface EtatGreffonEgaliseur {
  name: string;
  /** Le réglage `plugin_equalizer_installed` est posé à `true`. */
  installed?: boolean;
  /** Le greffon tourne : ses routes sont montées. */
  enabled?: boolean;
}

/**
 * `null` tant qu'on n'a pas de réponse, `'absent'` quand le serveur liste ses
 * greffons sans l'égaliseur.
 */
export const greffonEgaliseur = writable<EtatGreffonEgaliseur | null | 'absent'>(null);

/**
 * Le bouton EQ de Lecture en cours a-t-il un sens ?
 *
 * 🔴 L'INDÉTERMINÉ VAUT « OUI », et c'est délibéré — l'inverse du choix fait
 * pour Concerts. Un serveur antérieur à la v0.9.156 n'expose pas cette route,
 * ou la rend autrement : y masquer l'égaliseur retirerait une fonction qui
 * marche, à quelqu'un qui s'en sert. On ne masque donc que ce qu'on SAIT
 * absent, jamais ce qu'on ignore.
 *
 * ⚠️ On lit `installed`, pas `enabled` : un greffon installé mais dont les
 * routes ne sont pas encore montées (le serveur n'a pas redémarré) reste un
 * égaliseur que l'utilisateur possède. Le masquer là lui ferait croire que son
 * installation a échoué.
 */
export const egaliseurReglable = derived(greffonEgaliseur, ($g) => {
  if ($g === null) return true;
  if ($g === 'absent') return false;
  return $g.installed === true;
});

/**
 * Interroger le serveur une fois. Silencieux en cas d'échec : on garde
 * l'indéterminé, donc le bouton, plutôt que de le faire clignoter.
 */
export async function rafraichirGreffonEgaliseur(): Promise<void> {
  try {
    const greffons = (await api.getInstalledPlugins()) as unknown as EtatGreffonEgaliseur[];
    const eq = greffons.find((p) => p.name === 'equalizer');
    greffonEgaliseur.set(eq ?? 'absent');
  } catch {
    // Indéterminé : on ne retire rien à personne sur une erreur réseau.
  }
}
