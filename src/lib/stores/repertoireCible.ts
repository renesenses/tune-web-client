/**
 * Le dossier que l'écran « Répertoires » doit ouvrir à son arrivée.
 *
 * Même forme que `v2SettingsTarget` : un écran demande, l'autre consomme et
 * remet à `null`. Sans cela, revenir aux Répertoires par la barre latérale
 * rouvrirait indéfiniment le dernier album localisé.
 */
import { writable } from 'svelte/store';

export const repertoireCible = writable<string | null>(null);

export function ouvrirLeRepertoire(chemin: string) {
  repertoireCible.set(chemin);
}

export function consommerRepertoireCible(): string | null {
  let v: string | null = null;
  repertoireCible.update((x) => { v = x; return null; });
  return v;
}
