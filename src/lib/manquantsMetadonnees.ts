/**
 * L'onglet « Manquants » de l'écran Métadonnées — réunion avec Yves (Sevy
 * Tabroc) du 17/09/2026 : « Écran métadata, ajouter boutons et traitements :
 * retrouver les covers manquantes, les genres manquants, les années
 * manquantes ».
 *
 * Les traitements existent côté serveur ; il manquait de quoi les lancer et
 * les suivre dans le nouveau client :
 *  - pochettes d'albums : `POST /library/artwork/enrich` (Cover Art Archive,
 *    puis Discogs si un jeton est enregistré), état dans
 *    `GET /library/artwork/enrich/status` ;
 *  - genres ET années (et label) : `POST /library/enrich-all`, UNE passe
 *    MusicBrainz qui remplit les trois à la fois, état dans
 *    `GET /library/enrich-all/status`. D'où un seul bouton pour les deux : deux
 *    boutons lanceraient le même traitement.
 *
 * Ce module ne fait que LIRE les réponses d'état, sous une forme commune.
 */

export interface Avancement {
  enCours: boolean;
  /** Ce que la passe a traité ou trouvé. */
  trouves: number;
  /** Le nombre d'éléments qu'elle s'est donné. */
  total: number;
  /** Pochettes : ce qui a été cherché jusqu'ici (sinon `null`). */
  recherches: number | null;
}

const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** `GET /library/artwork/enrich/status` → `{result, albums_without_cover}`.
 *  `result` n'existe pas avant la première passe ; `status: 'running'` tant
 *  qu'elle tourne, absent une fois finie. */
export function avancementPochettes(r: { result?: Record<string, unknown> | null } | null | undefined): Avancement | null {
  const res = r?.result;
  if (!res) return null;
  return {
    enCours: res.status === 'running',
    trouves: nombre(res.enriched),
    total: nombre(res.total),
    recherches: typeof res.searched === 'number' ? res.searched : null,
  };
}

/** `GET /library/enrich-all/status` → `{status: running|done|idle, enriched, total}`.
 *  `idle` sans total : aucune passe n'a tourné — rien à annoncer. */
export function avancementMusicBrainz(
  r: { status?: string; enriched?: number; total?: number } | null | undefined,
): Avancement | null {
  if (!r || (r.status === 'idle' && !nombre(r.total))) return null;
  return {
    enCours: r.status === 'running',
    trouves: nombre(r.enriched),
    total: nombre(r.total),
    recherches: null,
  };
}
