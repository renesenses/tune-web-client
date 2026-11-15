/**
 * tune-server-rust#7876 — ordre des dossiers de musique (Réglages › Bibliothèque).
 *
 * L'écran affiche `music_dirs` tels que `GET /system/config` les rend (écriture
 * brute), alors que `GET/PUT /library/repertoires/ordre` rend l'écriture
 * NORMALISÉE par le serveur (séparateur final retiré, `/` changé en `\` sous
 * Windows). L'ancienne comparaison à l'identique ne retrouvait aucune entrée
 * dès que les deux écritures différaient : le PUT réussissait mais la liste
 * redessinée restait la même, et les flèches semblaient sans effet.
 */

/** Clé de comparaison : séparateurs unifiés, séparateur final retiré. */
export function cleDossier(chemin: string): string {
  const unifie = chemin.trim().replace(/\\/g, '/');
  const sansFin = unifie.replace(/\/+$/, '');
  return sansFin === '' ? unifie.slice(0, 1) : sansFin;
}

/**
 * Les dossiers affichés (écriture de `musicDirs`), rangés selon `ordre`.
 * `ordre === null` : serveur sans la route d'ordre, la liste reste telle quelle.
 * Les dossiers que l'ordre ne cite pas viennent ensuite, dans leur ordre.
 */
export function dossiersOrdonnes(musicDirs: string[], ordre: string[] | null): string[] {
  if (ordre === null) return musicDirs;
  const parCle = new Map<string, string>();
  for (const d of musicDirs) {
    const k = cleDossier(d);
    if (!parCle.has(k)) parCle.set(k, d);
  }
  const out: string[] = [];
  const vus = new Set<string>();
  for (const o of ordre) {
    const k = cleDossier(o);
    const d = parCle.get(k);
    if (d !== undefined && !vus.has(k)) {
      out.push(d);
      vus.add(k);
    }
  }
  for (const d of musicDirs) {
    const k = cleDossier(d);
    if (!vus.has(k)) {
      out.push(d);
      vus.add(k);
    }
  }
  return out;
}

/** L'ordre à afficher dans une réponse de la route : `ordre_affiche` (serveur #7876) sinon `ordre`. */
export function ordreDeLaReponse(r: { ordre?: unknown; ordre_affiche?: unknown } | null | undefined): string[] | null {
  const brut = Array.isArray(r?.ordre_affiche) ? r?.ordre_affiche : r?.ordre;
  return Array.isArray(brut) ? brut.filter((d): d is string => typeof d === 'string') : null;
}
