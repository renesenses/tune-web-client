/**
 * web#3258 (relecture de suivi) — « Ajouter à la file » de la sélection
 * multiple, HORS de la barre d'actions.
 *
 * La boucle vivait dans `BarreSelectionAlbums` et s'arrêtait à son
 * démontage : changer d'onglet (la barre se masque) coupait l'ajout. Elle vit
 * ici, au niveau du module : seuls « Arrêter » et « Terminé » l'arrêtent
 * (`arreterFile`), et la barre remontée relit sa progression
 * (`fileSelection`).
 *
 * Un album après l'autre (la file garde l'ordre affiché) ; un échec n'arrête
 * pas la suite ; un second ajout ne peut pas démarrer tant qu'un premier
 * tourne.
 */
import { writable } from 'svelte/store';

export interface ProgressionFile { fait: number; total: number; echecs: number }
export interface BilanFile { ajoutes: number; echecs: number; total: number; arrete: boolean }

export const fileSelection = writable<ProgressionFile | null>(null);

let controleur: AbortController | null = null;

export function fileEnCours(): boolean {
  return controleur != null;
}

/** « Arrêter » ou « Terminé » : la boucle s'arrête après l'album en cours. */
export function arreterFile(): void {
  controleur?.abort();
}

export async function enfilerAlbums(
  ids: readonly number[],
  ajouter: (albumId: number) => Promise<unknown>,
): Promise<BilanFile | null> {
  if (controleur || !ids.length) return null;
  const c = new AbortController();
  controleur = c;
  let ajoutes = 0;
  let echecs = 0;
  fileSelection.set({ fait: 0, total: ids.length, echecs: 0 });
  try {
    for (const id of ids) {
      if (c.signal.aborted) break;
      try { await ajouter(id); ajoutes++; } catch { echecs++; }
      fileSelection.set({ fait: ajoutes + echecs, total: ids.length, echecs });
    }
  } finally {
    controleur = null;
    fileSelection.set(null);
  }
  return { ajoutes, echecs, total: ids.length, arrete: c.signal.aborted && ajoutes + echecs < ids.length };
}

/** Pour les témoins : aucune file en cours. */
export function _remiseAZeroFile(): void {
  controleur?.abort();
  controleur = null;
  fileSelection.set(null);
}
