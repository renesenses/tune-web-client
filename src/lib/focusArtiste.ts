/**
 * LE FOCUS PAR ARTISTE D'UNE FICHE D'ALBUM — renesenses/tune-server-rust#4767.
 *
 * FabienM, forum fil 1875 : sur la page d'un artiste, ouvrir une compilation
 * ou un album d'un autre artiste doit montrer SES titres, pas les vingt de la
 * galette. Roon pose à cet endroit une pastille refermable « Affichage des
 * morceaux interprétés par … ».
 *
 * La donnée est l'artiste de CHAQUE piste (`tracks.artist_id`), jamais
 * `track_credits` : cette table est vide en pratique (mesure du 23/09/2026 sur
 * le .18, 0 crédit pour Neil Young).
 *
 * 🔴 Ce module ne rend pas une liste filtrée mais les RANGS des pistes
 * gardées, dans l'album entier. La fiche d'album lance sa lecture par un
 * `start_index` que le serveur interprète sur l'album COMPLET : filtrer la
 * liste sans garder ce rang ferait jouer la mauvaise piste sur « lire à partir
 * d'ici ». Les rangs sont donc la sortie, et la liste s'en déduit.
 */

/** L'artiste sur lequel une fiche d'album est focalisée. */
export interface FocusArtiste {
  id: number;
  nom: string;
}

/**
 * La section de la page artiste d'où sort une vignette — `null` pour la
 * discographie, qui n'ouvre jamais de fiche focalisée.
 */
export type OrigineSection = 'compilations' | 'apparitions' | null;

/**
 * L'identifiant d'artiste d'une piste, ou `null`.
 *
 * `artist_id` est optionnel dans `Track` et l'API peut le rendre en CHAÎNE —
 * même précaution que le repli d'artiste de `AlbumDetailV2` (#3708).
 */
export function idArtisteDePiste(piste: unknown): number | null {
  const brut = (piste as { artist_id?: unknown } | null | undefined)?.artist_id;
  if (brut == null) return null;
  const texte = String(brut).trim();
  if (texte === '') return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

/**
 * Les rangs, dans l'album entier, des pistes que la fiche doit montrer.
 *
 * Sans focus : tous les rangs, dans l'ordre — la fiche se comporte exactement
 * comme avant. Avec un focus qui ne garde AUCUNE piste (album rescanné,
 * artiste fusionné depuis l'ouverture de la page), on rend l'album entier
 * plutôt qu'un écran vide : une liste vide ne s'explique pas, et la section
 * d'où l'on vient promettait au moins une piste.
 */
export function rangsDeLArtiste(pistes: readonly unknown[], focus: number | null | undefined): number[] {
  const tous = pistes.map((_, i) => i);
  if (focus == null) return tous;
  const gardes = tous.filter((i) => idArtisteDePiste(pistes[i]) === focus);
  return gardes.length ? gardes : tous;
}

/** Les pistes désignées par ces rangs, dans l'ordre de l'album. */
export function pistesAuxRangs<T>(pistes: readonly T[], rangs: readonly number[]): T[] {
  return rangs.map((i) => pistes[i]).filter((p): p is T => p !== undefined);
}

/**
 * Le rang, dans l'album entier, de la n-ième piste AFFICHÉE.
 *
 * C'est la traduction qui sauve `start_index` : hors bornes — ou sans focus —
 * elle rend le rang tel quel.
 */
export function rangDansLAlbum(rangs: readonly number[], rangAffiche: number): number {
  const reel = rangs[rangAffiche];
  return reel === undefined ? rangAffiche : reel;
}

/** Le focus retient-il moins que l'album entier ? Sinon, pas de pastille. */
export function focusRestreint(pistes: readonly unknown[], rangs: readonly number[]): boolean {
  return rangs.length > 0 && rangs.length < pistes.length;
}
