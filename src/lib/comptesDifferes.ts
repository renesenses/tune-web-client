/**
 * tune-server-rust#9116 (fil 2935, Thierry C., 544 147 pistes) — « à quoi te
 * sert de compter le nombre de fichiers présents dans chaque arborescence
 * quand c'est moi qui prendrai la décision d'ouvrir tel ou tel disque ? ».
 *
 * L'écran Répertoires n'attend plus les comptes : le serveur rend la liste
 * des dossiers tout de suite et, tant que son arbre des dossiers n'est pas
 * construit, l'annonce par `comptes_en_attente: true` (comptes à 0). Cette
 * fonction redemande la même réponse en arrière-plan, à intervalles
 * croissants, jusqu'à ce que les comptes soient connus — sans jamais retenir
 * la navigation : elle s'arrête dès que l'écran a changé de dossier.
 */
export const DELAIS_DES_COMPTES_MS = [700, 1500, 3000, 6000, 10000] as const;

export async function attendreLesComptes<T extends { comptes_en_attente?: boolean }>(
  lire: () => Promise<T>,
  encoreVoulu: () => boolean,
  attendre: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  delais: readonly number[] = DELAIS_DES_COMPTES_MS,
): Promise<T | null> {
  for (const d of delais) {
    await attendre(d);
    if (!encoreVoulu()) return null;
    let r: T;
    try {
      r = await lire();
    } catch {
      return null;
    }
    if (!encoreVoulu()) return null;
    if (!r.comptes_en_attente) return r;
  }
  return null;
}
