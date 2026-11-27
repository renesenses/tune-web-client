/** Segments de la page « Mes fichiers locaux » (Nocturne, itération 9). */
export const ONGLETS_FICHIERS = ['entretien', 'albums', 'doublons'] as const;
export type OngletFichiers = (typeof ONGLETS_FICHIERS)[number];
export function estOngletFichiers(v: unknown): v is OngletFichiers {
  return typeof v === 'string' && (ONGLETS_FICHIERS as readonly string[]).includes(v);
}
