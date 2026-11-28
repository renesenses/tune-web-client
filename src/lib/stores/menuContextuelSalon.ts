/**
 * Menu contextuel de Roon-like (lot 12, 28/11/2026) — demande de Sandro (fil
 * 3101), et geste de la référence : un clic droit sur un morceau, un album
 * ou un artiste ouvre ses actions là où est le pointeur. Un seul menu à la
 * fois, monté par la coquille (`MenuContextuelSalon.svelte`).
 */
import { writable } from 'svelte/store';

export interface EntreeMenu { libelle: string; faire: () => void; }
export interface MenuOuvert { x: number; y: number; titre?: string | null; entrees: EntreeMenu[]; }

export const menuContextuel = writable<MenuOuvert | null>(null);

/** Ouvre le menu au pointeur (ou sous l'élément, au clavier). */
export function ouvrirMenuContextuel(e: MouseEvent, entrees: EntreeMenu[], titre: string | null = null): void {
  if (!entrees.length) return;
  e.preventDefault();
  e.stopPropagation();
  let x = e.clientX, y = e.clientY;
  if (!x && !y && e.currentTarget instanceof HTMLElement) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.left; y = r.bottom;
  }
  menuContextuel.set({ x, y, titre, entrees });
}

export function fermerMenuContextuel(): void { menuContextuel.set(null); }

/**
 * Sélection multiple (Cmd/Ctrl + clic : ajoute ou retire ; Maj + clic : la
 * plage depuis le dernier point). Pure, testable : rend la nouvelle sélection
 * et le nouveau point d'ancrage.
 */
export function selectionApresClic<K>(
  ordre: readonly K[], selection: ReadonlySet<K>, ancre: K | null, cle: K, mod: { bascule: boolean; plage: boolean },
): { selection: Set<K>; ancre: K | null } {
  if (mod.plage && ancre != null) {
    const a = ordre.indexOf(ancre), b = ordre.indexOf(cle);
    if (a >= 0 && b >= 0) {
      const [d, f] = a < b ? [a, b] : [b, a];
      return { selection: new Set([...selection, ...ordre.slice(d, f + 1)]), ancre };
    }
  }
  if (mod.bascule) {
    const s = new Set(selection);
    if (s.has(cle)) s.delete(cle); else s.add(cle);
    return { selection: s, ancre: cle };
  }
  return { selection: new Set(), ancre: cle };
}

/** Les éléments que vise un clic droit : la sélection s'il en fait partie, sinon lui seul. */
export function cibleDuMenu<K>(selection: ReadonlySet<K>, cle: K): K[] {
  return selection.has(cle) && selection.size > 1 ? [...selection] : [cle];
}
