/**
 * Le DOSSIER d'un album sur le disque.
 *
 * Bertrand, 09/09/2026 : « Vue Albums : ajouter un bouton localiser sur le
 * disque / répertoire ».
 *
 * ## Ce que le serveur donne, et ce qu'il ne donne pas
 *
 * Mesuré sur le .18 le 09/09/2026 : un ALBUM ne porte aucun chemin. Ses clés
 * sont `added_at, artist_id, artist_name, barcode, bit_depth, catalog_number,
 * cover_path, disc_count, format, genre, genres, id, is_compilation, label,
 * musicbrainz_*, original_*, quality, release_date, sample_rate, source,
 * source_id, title, track_count, year` — pas de `file_path`, pas de `folder`.
 *
 * Une PISTE, si :
 *
 *     /data/music/NEW_FLAC/CHANSON FRANCAISE/M/1997-M - Le baptême/01-M-La fleur.flac
 *
 * Le dossier de l'album se DÉDUIT donc de ses pistes, et ce module fait cette
 * déduction — pour qu'un test l'appelle au lieu de la relire dans un écran.
 *
 * ## Le piège des albums multi-disques
 *
 * Un album gravé en deux disques range souvent ses pistes dans `CD1/` et
 * `CD2/`. Prendre le dossier de la PREMIÈRE piste ouvrirait `CD1`, c'est-à-dire
 * la moitié de l'album. On remonte donc au plus long préfixe COMMUN à toutes
 * les pistes : sur un album à disque unique il vaut le dossier lui-même, sur un
 * multi-disques il vaut le dossier parent — celui qui contient l'album entier.
 */

/** Le séparateur du chemin : Windows accepte les deux, Unix un seul. */
function separateur(chemin: string): string {
  return chemin.includes('\\') && !chemin.includes('/') ? '\\' : '/';
}

/** Le dossier qui contient un fichier. `null` si le chemin n'en a pas. */
export function dossierDuFichier(chemin: string | null | undefined): string | null {
  const c = (chemin ?? '').trim();
  if (!c) return null;
  const sep = separateur(c);
  const i = c.lastIndexOf(sep);
  // Pas de séparateur, ou un chemin qui n'est qu'une racine : rien à ouvrir.
  if (i <= 0) return null;
  return c.slice(0, i);
}

export interface PisteLocalisable {
  file_path?: string | null;
  source?: string | null;
}

/**
 * Le dossier à ouvrir pour un album, d'après ses pistes.
 *
 * `null` quand il n'y a rien à montrer : album de streaming, pistes sans
 * chemin, ou pistes dispersées sans dossier commun utile. On préfère ne pas
 * offrir le bouton plutôt que d'ouvrir un dossier qui n'est pas l'album.
 */
export function dossierDeLAlbum(pistes: readonly PisteLocalisable[] | null | undefined): string | null {
  const dossiers = (pistes ?? [])
    .filter((p) => (p?.source ?? 'local') === 'local')
    .map((p) => dossierDuFichier(p?.file_path))
    .filter((d): d is string => !!d);

  if (!dossiers.length) return null;
  if (dossiers.length === 1) return dossiers[0];

  const sep = separateur(dossiers[0]);
  const segments = dossiers.map((d) => d.split(sep));
  const commun: string[] = [];
  for (let i = 0; i < segments[0].length; i++) {
    const s = segments[0][i];
    if (segments.every((x) => x[i] === s)) commun.push(s);
    else break;
  }
  // Un préfixe vide (`['']` pour un chemin absolu) ou réduit à la racine ne
  // désigne pas un album : mieux vaut ne rien proposer.
  const chemin = commun.join(sep);
  return commun.filter(Boolean).length >= 1 ? chemin : null;
}
