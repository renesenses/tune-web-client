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
  | { nom: 'artiste'; id: number }
  /** Une collection de la colonne Bibliothèque (filtre sur la liste des albums). */
  | { nom: 'collection'; cle: CleCollection }
  /** Lecture en cours, plein écran. */
  | { nom: 'lecture' }
  /** Un écran de Tune monté tel quel dans la coquille (vue `activeView`). */
  | { nom: 'tune'; vue: string; onglet?: string };

export type CleCollection =
  | 'hires' | 'dsd' | 'mono' | 'favoris' | 'recents' | 'sansPochette' | 'doublons'
  | 'multicanal' | 'cd' | 'compresse';

const pile = writable<EcranNocturne[]>([{ nom: 'accueil' }]);

/** L'écran affiché. */
export const ecranNocturne = derived(pile, ($p) => $p[$p.length - 1]);
/**
 * Itération 6 — les écrans de Tune ouverts en PANNEAU latéral droit (comme la
 * référence) : ils s'empilent sur l'écran courant, qui reste visible derrière.
 */
export const VUES_EN_PANNEAU: ReadonlySet<string> = new Set(['settings']);
export function estEnPanneau(e: EcranNocturne): boolean {
  return e.nom === 'tune' && VUES_EN_PANNEAU.has(e.vue);
}
/**
 * L'écran dessiné DERRIÈRE un panneau : le dernier écran de la pile qui n'est
 * ni un panneau ni un écran de Tune (la coquille ne monte qu'un écran de Tune
 * à la fois, et le panneau le porte) ; l'accueil à défaut. Sans panneau :
 * l'écran courant.
 */
export function ecranDeFondDe(p: readonly EcranNocturne[]): EcranNocturne {
  const haut = p[p.length - 1];
  if (!haut || !estEnPanneau(haut)) return haut ?? { nom: 'accueil' };
  for (let i = p.length - 2; i >= 0; i--) if (p[i].nom !== 'tune') return p[i];
  return { nom: 'accueil' };
}
export const ecranDeFond = derived(pile, ($p) => ecranDeFondDe($p));

/** Vrai quand « Retour » a un écran où revenir. */
export const retourPossible = derived(pile, ($p) => $p.length > 1);

export function memeEcran(a: EcranNocturne, b: EcranNocturne): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

/** Ouvre un écran de Tune dans la coquille (`onglet` : l'onglet à poser, ex. Bibliothèque › Genres). */
export function ouvrirTune(vue: string, onglet?: string): void {
  const e: EcranNocturne = onglet ? { nom: 'tune', vue, onglet } : { nom: 'tune', vue };
  // Un panneau s'ouvre PAR-DESSUS l'écran courant ; un panneau déjà ouvert est remplacé.
  if (VUES_EN_PANNEAU.has(vue)) {
    pile.update((p) => [...p.filter((x) => !estEnPanneau(x)), e]);
    return;
  }
  ouvrirRubrique(e);
}

/** Ferme le panneau ouvert (s'il y en a un). */
export function fermerPanneau(): void {
  pile.update((p) => (p.length > 1 && estEnPanneau(p[p.length - 1]) ? p.slice(0, -1) : p));
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
