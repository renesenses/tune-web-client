/**
 * Navigation de l'interface Nocturne — une pile d'écrans PROPRE à Nocturne.
 *
 * Volontairement indépendante de `lib/stores/navigation` (celle de ShellV2) :
 * Nocturne vit à côté des autres interfaces sans écrire dans leur état. Le
 * branchement au sélecteur d'interfaces (après la fusion de Salon) pourra
 * la relier à l'historique du navigateur si on le souhaite.
 */
import { derived, writable, get } from 'svelte/store';

export type EcranNocturne =
  | { nom: 'accueil' }
  | { nom: 'albums' }
  | { nom: 'artistes' }
  | { nom: 'album'; id: number }
  | { nom: 'artiste'; id: number };

const pile = writable<EcranNocturne[]>([{ nom: 'accueil' }]);

/** L'écran affiché. */
export const ecranNocturne = derived(pile, ($p) => $p[$p.length - 1]);
/** Vrai quand « Retour » a un écran où revenir. */
export const retourPossible = derived(pile, ($p) => $p.length > 1);

function memeEcran(a: EcranNocturne, b: EcranNocturne): boolean {
  return a.nom === b.nom && ('id' in a ? a.id : null) === ('id' in b ? b.id : null);
}

/** Ouvre un écran par-dessus le courant (sans doublon immédiat). */
export function allerA(e: EcranNocturne): void {
  pile.update((p) => (memeEcran(p[p.length - 1], e) ? p : [...p, e]));
  remonterEnHaut();
}

/** Ouvre une rubrique du tiroir : la pile repart de l'accueil. */
export function ouvrirRubrique(e: EcranNocturne): void {
  pile.set(e.nom === 'accueil' ? [e] : [{ nom: 'accueil' }, e]);
  remonterEnHaut();
}

export function retour(): void {
  if (get(pile).length > 1) pile.update((p) => p.slice(0, -1));
}

/** Remet la pile à zéro sur un écran donné (point d'entrée de démonstration). */
export function reinitialiser(e: EcranNocturne = { nom: 'accueil' }): void {
  pile.set(e.nom === 'accueil' ? [e] : [{ nom: 'accueil' }, e]);
}

function remonterEnHaut(): void {
  if (typeof document === 'undefined') return;
  document.querySelector('.noc-contenu')?.scrollTo({ top: 0 });
}
