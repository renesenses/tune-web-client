/**
 * web#3247 (Patatorz, fil 2912) — TOUS les titres d'une étiquette, pour
 * « Tout lire » (et ses variantes : aléatoire, en boucle, ensuite, à la file)
 * et « Ajouter tout à une playlist ».
 *
 * Le serveur n'a pas de route « toutes les pistes d'une étiquette » : l'écran
 * a déjà les familles (`/tags/{id}/albums|tracks|artists|playlists|
 * smart-playlists`), et chaque objet sait rendre ses pistes par `pistesDe`
 * (`lib/gestesObjet`) — la MÊME résolution que le menu « … » de chaque objet,
 * locale ou de service. Rien n'est redéfini ici.
 *
 * Ordre : les albums (dans l'ordre affiché), puis les titres étiquetés, puis
 * les artistes, puis les playlists. Un titre présent deux fois (étiqueté ET
 * dans un album étiqueté) n'est gardé qu'une fois, à sa première place.
 *
 * Les collections restent hors champ : leur contenu est un ensemble d'albums
 * qu'on n'a pas étiquetés, et une collection intelligente peut couvrir toute
 * la bibliothèque.
 *
 * Les requêtes partent à concurrence BORNÉE (5), comme `getAlbumTracksBatch` :
 * une étiquette de deux cents albums ne lance pas deux cents requêtes d'un
 * coup. Un objet en échec ne coûte que ses propres pistes ; il est compté
 * (`echecs`) pour que l'écran le dise.
 */
import type { Track } from './types';
import {
  pistesDe, objetAlbum, objetArtiste, objetPlaylist, objetPlaylistIntelligente, type ObjetMenu,
} from './gestesObjet';

export interface ContenuEtiquette {
  albums: readonly any[];
  pistes: readonly Track[];
  artistes: readonly any[];
  /** Playlists ordinaires et intelligentes (`smart: true`), comme l'onglet. */
  listes: readonly any[];
}

/** L'identité d'un titre : son id de bibliothèque, sinon service + id. */
export function cleDePiste(t: Partial<Track> | null | undefined): string | null {
  if (!t) return null;
  if (t.id != null) return `id:${t.id}`;
  if (t.source && t.source_id != null && String(t.source_id) !== '') return `${t.source}:${t.source_id}`;
  return null;
}

const CONCURRENCE = 5;

export async function pistesDeLEtiquette(
  c: ContenuEtiquette,
  resoudre: (o: ObjetMenu) => Promise<Track[]> = pistesDe,
): Promise<{ pistes: Track[]; echecs: number }> {
  // Une case par source, dans l'ordre : les titres étiquetés sont déjà là.
  const sources: (ObjetMenu | Track[])[] = [
    ...c.albums.map((a) => objetAlbum(a)),
    [...c.pistes],
    ...c.artistes.map((a) => objetArtiste(a)),
    ...c.listes.map((pl) => (pl?.smart ? objetPlaylistIntelligente(pl) : objetPlaylist(pl))),
  ];
  const resultats: Track[][] = new Array(sources.length).fill(null).map(() => []);
  let echecs = 0;
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < sources.length) {
      const i = suivant++;
      const s = sources[i];
      if (Array.isArray(s)) { resultats[i] = s; continue; }
      try {
        const l = await resoudre(s);
        resultats[i] = Array.isArray(l) ? l : [];
      } catch {
        echecs++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCE, sources.length) }, ouvrier));

  const vues = new Set<string>();
  const pistes: Track[] = [];
  for (const t of resultats.flat()) {
    const k = cleDePiste(t);
    if (k != null) {
      if (vues.has(k)) continue;
      vues.add(k);
    }
    pistes.push(t);
  }
  return { pistes, echecs };
}
