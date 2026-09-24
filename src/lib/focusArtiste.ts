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
  /**
   * #4767 (crédits) — les pistes à montrer, par IDENTIFIANT de piste.
   *
   * « Collaborations » et « Reprises » sortent de `track_credits` : sur ces
   * disques, `tracks.artist_id` désigne l'artiste PRINCIPAL, jamais celui de
   * la page (le guitariste invité, l'auteur repris). Le serveur rend donc la
   * liste des pistes créditées (`focus_track_ids`) et c'est sur elle que le
   * focus filtre. Absente : focus par `tracks.artist_id`, comme avant.
   */
  pistes?: readonly number[] | null;
}

/**
 * La section de la page artiste d'où sort une vignette — `null` pour la
 * discographie, qui n'ouvre jamais de fiche focalisée.
 */
export type OrigineSection = 'compilations' | 'apparitions' | 'collaborations' | 'reprises' | null;

/** Les sections dont le focus vient des CRÉDITS (`focus_track_ids`). */
const SECTIONS_DE_CREDITS: readonly OrigineSection[] = ['collaborations', 'reprises'];

/**
 * Les identifiants de pistes créditées que porte un album de « Collaborations »
 * ou de « Reprises » (`focus_track_ids`), nettoyés — ou `null` si l'album n'en
 * porte pas (serveur antérieur, autre section).
 */
export function idsDuFocus(album: unknown): number[] | null {
  const brut = (album as { focus_track_ids?: unknown } | null | undefined)?.focus_track_ids;
  if (!Array.isArray(brut)) return null;
  const ids = brut.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return ids.length ? ids : null;
}

/**
 * Le focus d'une fiche d'album ouverte depuis une section de la page artiste.
 *
 * Discographie (`origine` nulle) : aucun. « Compilations » / « Apparitions » :
 * l'artiste de la page, par `tracks.artist_id`. « Collaborations » /
 * « Reprises » : l'artiste de la page, par les pistes CRÉDITÉES de l'album —
 * et sans elles, pas de focus du tout : filtrer ces disques sur
 * `tracks.artist_id` ne garderait rien.
 */
export function focusDeSection(
  origine: OrigineSection,
  album: unknown,
  artiste: { id?: number | null; name?: string | null } | null | undefined,
): FocusArtiste | null {
  if (!origine || artiste?.id == null) return null;
  const nom = artiste.name ?? '';
  if (!SECTIONS_DE_CREDITS.includes(origine)) return { id: artiste.id, nom };
  const pistes = idsDuFocus(album);
  return pistes ? { id: artiste.id, nom, pistes } : null;
}

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

/**
 * Les rangs, dans l'album entier, des pistes dont l'IDENTIFIANT est dans
 * `ids` — le focus des sections de crédits. Mêmes garanties que
 * [`rangsDeLArtiste`] : rien ne correspond, l'album entier revient.
 */
export function rangsDesPistes(pistes: readonly unknown[], ids: readonly number[] | null | undefined): number[] {
  const tous = pistes.map((_, i) => i);
  if (!ids?.length) return tous;
  const voulus = new Set(ids.map(Number));
  const gardes = tous.filter((i) => {
    const brut = (pistes[i] as { id?: unknown } | null | undefined)?.id;
    return brut != null && voulus.has(Number(brut));
  });
  return gardes.length ? gardes : tous;
}

/** Les rangs que retient un focus : par pistes créditées s'il en porte, sinon
 *  par artiste de piste. */
export function rangsDuFocus(pistes: readonly unknown[], focus: FocusArtiste | null | undefined): number[] {
  if (focus?.pistes?.length) return rangsDesPistes(pistes, focus.pistes);
  return rangsDeLArtiste(pistes, focus?.id ?? null);
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
