/**
 * #7224 — « Chercher dans mes sources » depuis la bibliothèque d'un contact.
 *
 * L'écoute chez un contact est fermée par défaut (décision du 10/10/2026,
 * #6086) : l'écran n'a ni bouton Lire ni action. Ce module donne l'alternative :
 * chercher l'album (titre + artiste) ou la piste dans MES sources — la
 * bibliothèque locale et les services connectés — avec la recherche globale
 * existante (`GET /search`, `federatedSearch`), sans nouvelle route serveur.
 *
 * Pur : aucune dépendance à un écran. Les corps de lecture sont ceux que
 * `SearchV2` envoie déjà (`source` va TOUJOURS avec `streaming_album_id`).
 */
import { federatedSearch } from './api';
import type { Album, FederatedSearchResult, Track } from './types';

export type GenreRecherche = 'album' | 'track';

/** Ce que l'écran cherche : le titre et l'artiste, tels que le contact les porte. */
export interface CibleRecherche {
  genre: GenreRecherche;
  titre: string;
  artiste?: string | null;
}

export interface Correspondance {
  genre: GenreRecherche;
  /** `local` ou la clé du service (`qobuz`, `tidal`…). */
  source: string;
  titre: string;
  artiste: string;
  /** Le corps envoyé à la lecture (`playAndSync`). */
  lecture: Record<string, unknown>;
}

/** Par source et par genre : assez pour choisir, pas assez pour noyer l'écran. */
export const MAX_PAR_SOURCE = 5;
const LIMITE_RECHERCHE = 12;

/** Les termes de la recherche : titre puis artiste, espaces nettoyés. */
export function termesRecherche(c: CibleRecherche): string {
  return [c.titre, c.artiste].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
}

const corpsAlbum = (a: Album, source: string): Record<string, unknown> | null => {
  if (source === 'local') return a.id != null ? { album_id: a.id } : null;
  const sid = (a as any).source_id ?? a.id;
  return sid != null ? { streaming_album_id: String(sid), source } : null;
};

const corpsPiste = (t: Track, source: string): Record<string, unknown> | null => {
  if (source === 'local') return t.id != null ? { track_id: t.id } : null;
  if (!t.source_id) return null;
  return {
    source, source_id: String(t.source_id), title: t.title ?? null, artist_name: t.artist_name ?? null,
    album_title: t.album_title ?? null, cover_path: t.cover_path ?? null, duration_ms: t.duration_ms,
  };
};

/** Les correspondances du genre demandé, bibliothèque locale d'abord, puis chaque service. */
export function correspondances(res: FederatedSearchResult | null | undefined, genre: GenreRecherche): Correspondance[] {
  const sorties: Correspondance[] = [];
  const blocs: [string, { albums?: Album[]; tracks?: Track[] } | undefined][] = [
    ['local', res?.local],
    ...Object.entries(res?.services ?? {}).map(([svc, b]) => [svc, b] as [string, { albums?: Album[]; tracks?: Track[] }]),
  ];
  for (const [source, bloc] of blocs) {
    const items: any[] = (genre === 'album' ? bloc?.albums : bloc?.tracks) ?? [];
    let n = 0;
    for (const it of items) {
      if (n >= MAX_PAR_SOURCE) break;
      const lecture = genre === 'album' ? corpsAlbum(it, source) : corpsPiste(it, source);
      if (!lecture || !it.title) continue;
      sorties.push({ genre, source, titre: String(it.title), artiste: String(it.artist_name ?? ''), lecture });
      n++;
    }
  }
  return sorties;
}

/** Lance la recherche globale et rend les correspondances. Rejette si la recherche échoue. */
export async function chercherDansMesSources(c: CibleRecherche): Promise<{ termes: string; resultats: Correspondance[] }> {
  const termes = termesRecherche(c);
  const res = await federatedSearch(termes, undefined, LIMITE_RECHERCHE);
  return { termes, resultats: correspondances(res, c.genre) };
}
