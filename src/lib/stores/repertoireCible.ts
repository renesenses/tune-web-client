/**
 * Le dossier que l'écran « Répertoires » doit ouvrir à son arrivée.
 *
 * Même forme que `v2SettingsTarget` : un écran demande, l'autre consomme et
 * remet à `null`. Sans cela, revenir aux Répertoires par la barre latérale
 * rouvrirait indéfiniment le dernier album localisé.
 */
import { writable } from 'svelte/store';
import { viserDetail } from '../historiqueCoquille';

export const repertoireCible = writable<string | null>(null);

/**
 * LA CLÉ D'HISTORIQUE D'UN DOSSIER des Répertoires — web#1619.
 *
 * Chaque dossier ouvert à la main est un niveau de détail de la vue `browse`
 * (`#browse/dossier:/music/Blues`) : le Précédent du navigateur remonte ainsi
 * au dossier d'où l'on vient. Le chemin est rangé TEL QUEL dans l'état de
 * l'entrée ; pendant la session, c'est `history.state` qui aiguille, pas
 * l'adresse affichée.
 */
const PREFIXE_DOSSIER = 'dossier:';

/** La liste des emplacements, rejointe à la main par le fil d'Ariane. */
export const CLE_EMPLACEMENTS = 'emplacements';

export function cleDossier(chemin: string): string {
  return PREFIXE_DOSSIER + chemin;
}

/** Le chemin porté par une clé, ou `null` si ce n'est pas celle d'un dossier. */
export function cheminDeCleDossier(cle: string | null | undefined): string | null {
  if (!cle || !cle.startsWith(PREFIXE_DOSSIER)) return null;
  const chemin = cle.slice(PREFIXE_DOSSIER.length);
  return chemin || null;
}

/**
 * Demander aux Répertoires d'ouvrir `chemin` à leur arrivée.
 *
 * web#1619 : le dossier devient AUSSI la clé de l'entrée d'historique que le
 * changement de vue qui suit va écrire (`viserDetail`) — une seule entrée,
 * `#browse/dossier:…`, par-dessus celle d'où l'on vient. Le Précédent depuis
 * le dossier d'arrivée rend donc l'écran de départ (l'album, #854), et celui
 * d'un sous-dossier rend le dossier d'arrivée, pas la liste des emplacements.
 */
export function ouvrirLeRepertoire(chemin: string) {
  repertoireCible.set(chemin);
  viserDetail(cleDossier(chemin));
}

export function consommerRepertoireCible(): string | null {
  let v: string | null = null;
  repertoireCible.update((x) => { v = x; return null; });
  return v;
}
