/**
 * Navigation de l'interface « Salon » : la page affichée et sa pile de retour.
 *
 * Salon dessine lui-même ses pages (accueil, albums, artistes, fiches…) et
 * monte les autres écrans de Tune tels quels (`{ page: 'tune', vue }`, la vue
 * étant alors `activeView`). La pile ne sert qu'au bouton « < » de l'en-tête ;
 * l'historique du navigateur reste tenu par `historiqueCoquille`, sur
 * `activeView`, comme dans l'interface actuelle.
 */
import { writable, get } from 'svelte/store';
import { memePage, type PageSalon } from '../interfaceSalon';

const PILE_MAX = 50;

export const pageSalon = writable<PageSalon>({ page: 'accueil' });
export const pileSalon = writable<PageSalon[]>([]);

/** Ouvre une page ; l'actuelle part sur la pile (sauf si c'est la même). */
export function allerA(page: PageSalon): void {
  const actuelle = get(pageSalon);
  if (memePage(actuelle, page)) return;
  pileSalon.update((p) => [...p, actuelle].slice(-PILE_MAX));
  pageSalon.set(page);
}

/** Revient à la page précédente ; rend la page rouverte, ou `null`. */
export function reculerSalon(): PageSalon | null {
  const pile = get(pileSalon);
  if (!pile.length) return null;
  const precedente = pile[pile.length - 1];
  pileSalon.set(pile.slice(0, -1));
  pageSalon.set(precedente);
  return precedente;
}
