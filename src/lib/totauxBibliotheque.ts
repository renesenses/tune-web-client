/**
 * tune-server-rust#8625 (fil 2787, Pierre M) — décision de Bertrand du
 * 13/11 : des totaux cohérents. Statistiques disait 156 008 pistes quand
 * Titres en disait 155 539 : il comptait les TABLES, les listes ce qu'elles
 * montrent. Le serveur sert désormais LE total des listes sous
 * `library_totals` de `GET /library/stats` ; chaque écran l'affiche, et
 * l'écart restant (pistes masquées ou en double) est expliqué en infobulle.
 */

/** `library_totals` de `GET /library/stats` (tune-server-rust#8625). */
export interface TotauxBibliotheque {
  /** Le `total` de `GET /library/tracks` sans filtre (Titres). */
  tracks: number;
  /** Le `total` de `GET /library/albums` sans filtre (Albums). */
  albums: number;
  stored_tracks: number;
  stored_albums: number;
  hidden_or_duplicate_tracks: number;
  hidden_or_duplicate_albums: number;
}

/**
 * Les totaux à afficher. Un serveur d'avant #8625 n'envoie pas
 * `library_totals` : on retombe sur `tracks` / `albums` (compte des tables),
 * sans écart à expliquer.
 */
export function lireTotaux(stats: any): TotauxBibliotheque {
  const t = stats?.library_totals;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (t && n(t.tracks) != null && n(t.albums) != null) {
    const stockees = n(t.stored_tracks) ?? t.tracks;
    const stockes = n(t.stored_albums) ?? t.albums;
    return {
      tracks: t.tracks,
      albums: t.albums,
      stored_tracks: stockees,
      stored_albums: stockes,
      hidden_or_duplicate_tracks: n(t.hidden_or_duplicate_tracks) ?? Math.max(0, stockees - t.tracks),
      hidden_or_duplicate_albums: n(t.hidden_or_duplicate_albums) ?? Math.max(0, stockes - t.albums),
    };
  }
  const tracks = n(stats?.tracks) ?? 0;
  const albums = n(stats?.albums) ?? 0;
  return {
    tracks, albums, stored_tracks: tracks, stored_albums: albums,
    hidden_or_duplicate_tracks: 0, hidden_or_duplicate_albums: 0,
  };
}

/**
 * L'infobulle des totaux : ce qu'ils comptent, et ce que les tables gardent
 * sans le montrer. `tr` traduit une clé, `nombre` met un nombre en forme.
 */
export function infobulleTotaux(
  t: TotauxBibliotheque,
  tr: (cle: string) => string,
  nombre: (n: number) => string,
): string {
  const base = tr('bibliotheque.totaux.infobulle');
  if (!t.hidden_or_duplicate_tracks && !t.hidden_or_duplicate_albums) return base;
  return `${base} ${tr('bibliotheque.totaux.infobulleEcart')
    .replace('{storedTracks}', nombre(t.stored_tracks))
    .replace('{storedAlbums}', nombre(t.stored_albums))
    .replace('{hiddenTracks}', nombre(t.hidden_or_duplicate_tracks))
    .replace('{hiddenAlbums}', nombre(t.hidden_or_duplicate_albums))}`;
}
