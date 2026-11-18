/**
 * TESS W5 — le geste « Open TESS » du chemin du signal (maquette A4).
 *
 * L'écran TESS appartient à la coquille (W1). Ce magasin est ARMÉ par elle au
 * montage, sur le modèle des gestes de navigation de `stores/navigation.ts` :
 * `null` veut dire « je ne sais pas faire », et le bouton est alors ABSENT —
 * pas grisé, pas mort.
 */
import { writable } from 'svelte/store';

export const ouvrirEcranTess = writable<(() => void) | null>(null);
