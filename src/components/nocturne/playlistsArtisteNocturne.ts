/**
 * « Playlists » d'une page artiste (Nocturne, itération 7) : les playlists où
 * l'artiste apparaît — les vôtres (`GET /playlists`) et celles de Tune (les
 * playlists intelligentes, `GET /library/smart-playlists`).
 *
 * Le serveur n'a pas de route « playlists d'un artiste » : on lit les titres
 * de chaque playlist, au plus `PLAFOND_*` playlists, et on garde celles qui
 * contiennent un titre de l'artiste (par identifiant, sinon par nom exact).
 * Une playlist illisible est ignorée, sans faire tomber les autres.
 *
 * Itération 8 — pas de rafale : DEUX lectures à la fois au plus, et un cache
 * de SESSION (les titres de chaque playlist, et le résultat par artiste) : une
 * playlist n'est lue qu'une fois, quel que soit le nombre de pages d'artiste
 * ouvertes. La page ne lance le calcul que lorsque la section devient visible.
 */
import type { Track } from '../../lib/types';

export interface PlaylistDeLArtiste {
  cle: string;
  nom: string;
  origine: 'perso' | 'tune';
  /** Les titres de la playlist (pour la lire d'un geste), dans l'ordre. */
  pistes: number[];
  /** Combien sont de l'artiste. */
  deLArtiste: number;
}

export const PLAFOND_PERSO = 30;
export const PLAFOND_TUNE = 15;
/** Lectures de playlists simultanées, au plus. */
export const LECTURES_EN_PARALLELE = 2;

const cachePistes = new Map<string, Promise<Track[]>>();
const cacheArtistes = new Map<number, Promise<PlaylistDeLArtiste[]>>();
/** Vide le cache de session (tests ; une bascule de profil recharge la page). */
export function viderCachePlaylists(): void { cachePistes.clear(); cacheArtistes.clear(); }

export function titresDeLArtiste(pistes: readonly Pick<Track, 'artist_id' | 'artist_name'>[], artiste: { id: number; nom: string }): number {
  const nom = artiste.nom.trim().toLowerCase();
  return pistes.filter((p) => p.artist_id === artiste.id || (!!nom && (p.artist_name ?? '').trim().toLowerCase() === nom)).length;
}

interface Sources {
  playlists: () => Promise<{ id: number | null; name: string }[]>;
  pistesPlaylist: (id: number) => Promise<Track[]>;
  intelligentes: () => Promise<{ id?: number | null; name?: string | null }[]>;
  pistesIntelligente: (id: number) => Promise<Track[]>;
}

async function enParallele<T, R>(l: readonly T[], f: (x: T) => Promise<R>, n = LECTURES_EN_PARALLELE): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(l.length).fill(null);
  let i = 0;
  async function ouvrier() {
    while (i < l.length) {
      const k = i++;
      try { out[k] = await f(l[k]); } catch { out[k] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, n) }, ouvrier));
  return out;
}

/** Les titres d'une playlist, lus une fois par session (un échec n'est pas gardé). */
function pistesEnCache(cle: string, lire: () => Promise<Track[]>): Promise<Track[]> {
  let p = cachePistes.get(cle);
  if (!p) {
    p = lire();
    cachePistes.set(cle, p);
    p.catch(() => cachePistes.delete(cle));
  }
  return p;
}

export function playlistsDeLArtiste(artiste: { id: number; nom: string }, s: Sources): Promise<PlaylistDeLArtiste[]> {
  let p = cacheArtistes.get(artiste.id);
  if (!p) {
    p = calculer(artiste, s);
    cacheArtistes.set(artiste.id, p);
  }
  return p;
}

async function calculer(artiste: { id: number; nom: string }, s: Sources): Promise<PlaylistDeLArtiste[]> {
  const [perso, tune] = await Promise.all([
    s.playlists().catch(() => []),
    s.intelligentes().catch(() => []),
  ]);
  const candidates = [
    ...perso.filter((p) => p.id != null).slice(0, PLAFOND_PERSO).map((p) => ({ id: p.id as number, nom: p.name, origine: 'perso' as const })),
    ...tune.filter((p) => p.id != null).slice(0, PLAFOND_TUNE).map((p) => ({ id: p.id as number, nom: p.name ?? '', origine: 'tune' as const })),
  ];
  const lus = await enParallele(candidates, (c) => pistesEnCache(`${c.origine}-${c.id}`, () => (c.origine === 'perso' ? s.pistesPlaylist(c.id) : s.pistesIntelligente(c.id))));
  const out: PlaylistDeLArtiste[] = [];
  candidates.forEach((c, k) => {
    const pistes = lus[k] ?? [];
    const n = titresDeLArtiste(pistes, artiste);
    if (n > 0) out.push({ cle: `${c.origine}-${c.id}`, nom: c.nom, origine: c.origine, pistes: pistes.map((p) => p.id).filter((x): x is number => x != null), deLArtiste: n });
  });
  return out.sort((a, b) => b.deLArtiste - a.deLArtiste);
}
