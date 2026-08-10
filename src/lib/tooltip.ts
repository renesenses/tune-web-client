import { get } from 'svelte/store';
import { preferences } from './stores/preferences';
import { t } from './i18n';

/**
 * Bulle d'aide sur un élément, désactivable globalement.
 *
 * Pourquoi une action plutôt qu'un `title="..."` écrit à la main : un attribut
 * `title` natif est rendu par le navigateur, l'application n'a AUCUN moyen de
 * l'empêcher d'apparaître. Le réglage « ne plus afficher les bulles » serait
 * donc impossible à honorer — sauf à répéter partout un ternaire sur la
 * préférence. L'action pose ou retire l'attribut, en un seul endroit.
 *
 * Elle prend une CLÉ de traduction, pas un texte : impossible d'oublier la
 * traduction en chemin, et le garde-fou anti-français-en-dur reste satisfait.
 *
 *   <button use:tip={'queue.autoplayTip'}>
 */
export function tip(node: HTMLElement, key: string) {
  const apply = (k: string) => {
    if (get(preferences).tooltipsEnabled) {
      node.setAttribute('title', get(t)(k));
    } else {
      node.removeAttribute('title');
    }
  };
  apply(key);
  let current = key;
  // Réagit au changement de préférence ET au changement de langue, sans que
  // l'appelant ait à s'en soucier.
  const unsubPrefs = preferences.subscribe(() => apply(current));
  const unsubLang = t.subscribe(() => apply(current));
  return {
    update(next: string) {
      current = next;
      apply(next);
    },
    destroy() {
      unsubPrefs();
      unsubLang();
    },
  };
}
