/**
 * Tune Circle rc12 (maquettes de Levente, 15/11/2026) — les quatre onglets de
 * l'écran et leur navigation au clavier (motif ARIA « tabs » : flèches,
 * Début, Fin ; la sélection suit le focus).
 */
export const ONGLETS_CIRCLE = ['decouvrir', 'messages', 'playlists', 'cercle'] as const;
export type OngletCircle = (typeof ONGLETS_CIRCLE)[number];

/** L'onglet atteint par une touche depuis `courant`, ou `null` si la touche ne navigue pas. */
export function ongletVoisin(courant: OngletCircle, touche: string): OngletCircle | null {
  const i = ONGLETS_CIRCLE.indexOf(courant);
  const n = ONGLETS_CIRCLE.length;
  if (touche === 'ArrowRight') return ONGLETS_CIRCLE[(i + 1) % n];
  if (touche === 'ArrowLeft') return ONGLETS_CIRCLE[(i - 1 + n) % n];
  if (touche === 'Home') return ONGLETS_CIRCLE[0];
  if (touche === 'End') return ONGLETS_CIRCLE[n - 1];
  return null;
}
