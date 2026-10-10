/**
 * Les PLAYLISTS éditoriales d'un genre (renesenses/tune-server-rust#5313).
 *
 * Cyrille Moutia, fil 1685 : dans la vue d'un genre Qobuz, il ne trouvait que
 * des albums, et pas les playlists Qobuz du genre (classique, chanson
 * française…). Le serveur savait déjà les filtrer :
 * `GET /streaming/{service}/featured-playlists?genre=<id>` transmet le genre à
 * Qobuz (`genre_ids`). Mesuré sur le .18 le 09/10/2026 : Classique rend Steve
 * Reich, Trifonov, Savall ; Pop/Rock rend Johnny Marr, Flashback années 80.
 *
 * Les autres services rendent une liste vide : la bande n'apparaît pas, sans
 * liste de services en dur.
 */

/** Le serveur pagine jusqu'à 500 playlists : une bande n'en montre qu'une partie. */
export const LIMITE_PLAYLISTS_GENRE = 40;

/**
 * Charge la bande et la borne. Un échec, ou une réponse qui n'est pas une
 * liste, rend une bande vide : la vue du genre garde ses albums.
 */
export async function chargerPlaylistsDuGenre(
  charger: () => Promise<unknown>,
  limite = LIMITE_PLAYLISTS_GENRE,
): Promise<unknown[]> {
  let rendu: unknown;
  try {
    rendu = await charger();
  } catch {
    return [];
  }
  if (!Array.isArray(rendu)) return [];
  return rendu
    .filter((p) => {
      const o = p as { source_id?: unknown } | null;
      return !!o && o.source_id != null && String(o.source_id) !== '';
    })
    .slice(0, limite);
}
