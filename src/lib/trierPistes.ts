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
 * Même règle que `trierAlbums` : accents et casse repliés, une valeur
 * MANQUANTE toujours en dernier dans les deux sens, départage par titre puis
 * artiste pour un ordre stable.
 */
import type { Track } from './types';

export const CLES_TRI_PISTES = ['ordre', 'title', 'artist', 'album', 'year'] as const;
export type CleTriPistes = (typeof CLES_TRI_PISTES)[number];
export type SensTriPistes = 'asc' | 'desc';

export const LIBELLES_TRI_PISTES: Record<CleTriPistes, string> = {
  ordre: 'v2.pl.sortOrder',
  title: 'v2.lib.sortTitle',
  artist: 'v2.lib.sortArtist',
  album: 'common.album',
  year: 'v2.lib.sortYear',
};

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
    }
  };
  const departage = (a: Track, b: Track) =>
    parTexte(a.title ?? '', b.title ?? '') || parTexte(a.artist_name ?? '', b.artist_name ?? '');
  return [...pistes].sort((a, b) => {
    const va = valeur(a), vb = valeur(b);
    if (va == null && vb == null) return departage(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : parTexte(String(va), String(vb));
    return c !== 0 ? c * signe : departage(a, b);
  });
}
