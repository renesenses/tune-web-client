/**
 * Le tri des PISTES d'une playlist ouverte — Bertrand, 17/09/2026 : « toujours
 * pas de tri possible dans les playlists et collections. Je voudrais dates,
 * artist, album, title par asc et desc ».
 *
 * `ordre` est l'ordre de la playlist, celui que l'utilisateur a composé :
 * c'est le défaut, et le seul où déplacer une piste a un sens. Les autres clés
 * trient une COPIE, la liste reçue n'est jamais modifiée.
 *
 * « Dates » : une piste de playlist porte `year`, et rien d'autre — ni date
 * d'ajout à la playlist, ni date de sortie (mesuré sur le .18, playlist 13).
 *
 * web#3333 / tune-server-rust#9362 (fil forum 3000, Régis ; accord de Bertrand
 * du 22/11/2026, rc15) — trois critères de plus : `composer`, `added` (la date
 * d'ajout de la ligne À LA PLAYLIST, `playlist_added_at`, secondes Unix) et
 * `sample_rate` (départagé par `bit_depth`). Un serveur antérieur à #9362 ne
 * pose pas `playlist_added_at` ; une playlist sans compositeur connu n'a rien
 * à trier par compositeur : ces critères ne sont PROPOSÉS que si au moins une
 * piste reçue porte la valeur (`criteresDisponibles`).
 *
 * Même règle que `trierAlbums` : accents et casse repliés, une valeur
 * MANQUANTE toujours en dernier dans les deux sens, départage par titre puis
 * artiste pour un ordre stable.
 */
import type { Track } from './types';
import { lireChoix, ecrireChoix } from './preferencesEcran';

export const CLES_TRI_PISTES = ['ordre', 'title', 'artist', 'album', 'year', 'composer', 'added', 'sample_rate'] as const;
export type CleTriPistes = (typeof CLES_TRI_PISTES)[number];
export type SensTriPistes = 'asc' | 'desc';
export const SENS_TRI_PISTES: readonly SensTriPistes[] = ['asc', 'desc'];

export const LIBELLES_TRI_PISTES: Record<CleTriPistes, string> = {
  ordre: 'v2.pl.sortOrder',
  title: 'v2.lib.sortTitle',
  artist: 'v2.lib.sortArtist',
  album: 'common.album',
  year: 'v2.lib.sortYear',
  // Libellés existants, déjà traduits dans les seize langues : ceux des
  // colonnes de la table des titres et du tri de la Bibliothèque.
  composer: 'v2.tcol.composer',
  added: 'library.sortAddedDate',
  sample_rate: 'v2.tcol.sampleRate',
};

/** Les critères proposés quoi que portent les pistes (ceux d'avant #9362). */
const CRITERES_TOUJOURS: readonly CleTriPistes[] = ['ordre', 'title', 'artist', 'album', 'year'];

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** La date d'ajout à la playlist (tune-server-rust#9362), ou `null`. */
const dateDAjout = (t: Track): number | null => nombre(t.playlist_added_at);

/**
 * Les critères à PROPOSER pour ces pistes, dans l'ordre de `CLES_TRI_PISTES`.
 * Un critère de #9362 n'apparaît que si au moins une piste porte sa valeur :
 * un serveur qui ne l'envoie pas (antérieur à #9362), ou une playlist dont
 * aucune piste ne la connaît, ne montre pas un choix qui ne trierait rien.
 */
export function criteresDisponibles(pistes: readonly Track[]): CleTriPistes[] {
  const porte: Record<'composer' | 'added' | 'sample_rate', boolean> = {
    composer: pistes.some((t) => texte(t.composer) != null),
    added: pistes.some((t) => dateDAjout(t) != null),
    sample_rate: pistes.some((t) => nombre(t.sample_rate) != null),
  };
  return CLES_TRI_PISTES.filter((k) => CRITERES_TOUJOURS.includes(k) || porte[k as keyof typeof porte]);
}

/**
 * Le tri APPLIQUÉ : le choix retenu s'il est proposé pour ces pistes, sinon
 * l'ordre de la playlist. Le choix retenu n'est pas effacé pour autant : il
 * reprend dès que les pistes portent la valeur (chargement terminé, serveur
 * mis à jour).
 */
export function triApplicable(
  pistes: readonly Track[],
  choix: { cle: CleTriPistes; sens: SensTriPistes },
): { cle: CleTriPistes; sens: SensTriPistes } {
  return criteresDisponibles(pistes).includes(choix.cle) ? choix : { cle: 'ordre', sens: 'asc' };
}

const pli = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parTexte = (a: string, b: string) => pli(a).localeCompare(pli(b), undefined, { numeric: true });

export function trierPistes(pistes: readonly Track[], cle: CleTriPistes, sens: SensTriPistes): Track[] {
  if (cle === 'ordre') return sens === 'asc' ? [...pistes] : [...pistes].reverse();
  const signe = sens === 'asc' ? 1 : -1;
  const valeur = (t: Track): string | number | null => {
    switch (cle) {
      case 'title': return t.title?.trim() || null;
      case 'artist': return t.artist_name?.trim() || null;
      case 'album': return t.album_title?.trim() || null;
      case 'year': return typeof t.year === 'number' && t.year > 0 ? t.year : null;
      case 'composer': return texte(t.composer);
      case 'added': return dateDAjout(t);
      case 'sample_rate': return nombre(t.sample_rate);
    }
  };
  // Même fréquence : la résolution départage (24 bits avant 16 en descendant).
  const second = (a: Track, b: Track) =>
    cle === 'sample_rate' ? ((nombre(a.bit_depth) ?? 0) - (nombre(b.bit_depth) ?? 0)) * signe : 0;
  const departage = (a: Track, b: Track) =>
    parTexte(a.title ?? '', b.title ?? '') || parTexte(a.artist_name ?? '', b.artist_name ?? '');
  return [...pistes].sort((a, b) => {
    const va = valeur(a), vb = valeur(b);
    if (va == null && vb == null) return departage(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : parTexte(String(va), String(vb));
    return c !== 0 ? c * signe : second(a, b) || departage(a, b);
  });
}

/**
 * web#3333 (fil forum 3000) — le tri est retenu PAR PLAYLIST : « classique »
 * par compositeur, « chanson française » par artiste, « tests audio » par date
 * d'ajout, sans que l'une change les autres.
 *
 * La clé d'une playlist est celle de sa vue (`clePlaylistVue` :
 * `local:<id>` ou `<service>:<id chez le service>`). À la différence de la
 * vue, une playlist jamais réglée NE reprend PAS le dernier choix fait
 * ailleurs : elle reste sur l'ordre de la playlist, celui que l'utilisateur a
 * composé. L'ancienne clé unique (`v2.playlist.pistes.tri`) n'est donc plus
 * lue. Rien n'est écrit au montage (#1650) : seulement sur un geste.
 */
export const CLE_TRI_PISTES_PLAYLIST = 'v2.playlist.pistes.tri';
export const CLE_SENS_PISTES_PLAYLIST = 'v2.playlist.pistes.sens';

export function lireTriPlaylist(clePlaylist: string | null): { cle: CleTriPistes; sens: SensTriPistes } {
  if (!clePlaylist) return { cle: 'ordre', sens: 'asc' };
  return {
    cle: lireChoix<CleTriPistes>(`${CLE_TRI_PISTES_PLAYLIST}.${clePlaylist}`, CLES_TRI_PISTES, 'ordre'),
    sens: lireChoix<SensTriPistes>(`${CLE_SENS_PISTES_PLAYLIST}.${clePlaylist}`, SENS_TRI_PISTES, 'asc'),
  };
}

export function ecrireTriPlaylist(clePlaylist: string | null, tri: { cle: CleTriPistes; sens: SensTriPistes }): void {
  if (!clePlaylist) return;
  ecrireChoix(`${CLE_TRI_PISTES_PLAYLIST}.${clePlaylist}`, tri.cle);
  ecrireChoix(`${CLE_SENS_PISTES_PLAYLIST}.${clePlaylist}`, tri.sens);
}
