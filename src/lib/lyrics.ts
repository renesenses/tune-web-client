// Récupération + normalisation des paroles d'une piste pour le mode Grand écran.
//
// L'endpoint serveur `GET /library/tracks/{id}/lyrics` existe sous deux formes :
//   - historique : `{ lyrics: string|null, synced: string|null (LRC brut), source }`
//   - nouvelle   : `{ synced: bool, source: string, lines: [{ t_ms: number|null, text }] }`
// Ce module accepte les deux et rend une forme unique. Toute erreur (404 piste
// sans paroles, 405 endpoint absent, réseau) est avalée et rend `null` : côté
// affichage, « pas de paroles » n'est jamais une erreur.
//
// Pour les pistes RADIO (titre+artiste fournis par le flux, pas de track id),
// `fetchLyricsByMeta` interroge `GET /lyrics/by-meta` — même contrat de
// réponse, mêmes règles de silence.

import { BASE, fetchJSON } from './api';

export interface LyricLine {
  /** Horodatage en millisecondes, ou null pour des paroles non synchronisées. */
  t_ms: number | null;
  text: string;
}

export interface LyricsData {
  synced: boolean;
  source: string | null;
  lines: LyricLine[];
}

/** Parse un texte LRC brut (`[mm:ss.xx] paroles`) en lignes horodatées. */
export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (m) {
      const mins = parseInt(m[1]);
      const secs = parseInt(m[2]);
      const ms = parseInt(m[3].padEnd(3, '0'));
      lines.push({ t_ms: mins * 60000 + secs * 1000 + ms, text: m[4] });
    }
  }
  return lines;
}

/** Normalise une réponse paroles serveur (nouvelle ou historique) ; `null` = rien. */
export function normalizeLyricsResponse(r: any): LyricsData | null {
  if (!r || typeof r !== 'object') return null;

  // Nouvelle forme serveur : lignes déjà structurées.
  if (Array.isArray(r.lines)) {
    const lines: LyricLine[] = r.lines
      .filter((l: any) => l && typeof l.text === 'string')
      .map((l: any) => ({ t_ms: typeof l.t_ms === 'number' ? l.t_ms : null, text: l.text }));
    if (lines.length === 0) return null;
    const synced = r.synced === true && lines.some((l) => l.t_ms != null);
    return { synced, source: typeof r.source === 'string' ? r.source : null, lines };
  }

  // Forme historique : LRC brut dans `synced`, sinon texte simple dans `lyrics`.
  if (typeof r.synced === 'string' && r.synced) {
    const lines = parseLrc(r.synced);
    if (lines.length > 0) {
      return { synced: true, source: typeof r.source === 'string' ? r.source : null, lines };
    }
  }
  if (typeof r.lyrics === 'string' && r.lyrics.trim()) {
    return {
      synced: false,
      source: typeof r.source === 'string' ? r.source : null,
      lines: r.lyrics.split('\n').map((text: string) => ({ t_ms: null, text })),
    };
  }
  return null;
}

/** Charge et normalise les paroles d'une piste ; `null` = pas de paroles. */
export async function fetchTrackLyrics(trackId: number): Promise<LyricsData | null> {
  try {
    return normalizeLyricsResponse(await fetchJSON<any>(`${BASE}/library/tracks/${trackId}/lyrics`));
  } catch {
    // 404 (pas de paroles), 405 (endpoint pas encore déployé), réseau… :
    // comportement silencieux, l'affichage retombe sur « pochette seule ».
    return null;
  }
}

export interface MetaLyricsQuery {
  title: string;
  artist: string;
  /** Album — affine le match LRCLIB (pistes streaming). */
  album?: string | null;
  /** Durée en secondes — départage les versions côté LRCLIB (streaming). */
  durationSecs?: number | null;
  /** Vrai pour une radio (position imprécise → pas de karaoké côté panneau). */
  radio: boolean;
}

/** Paroles par métadonnées seules (pas d'id de bibliothèque) : radio (titre +
 *  artiste du flux) ou streaming Qobuz/Tidal (titre + artiste + album + durée).
 *  Serveur : cascade LRCLIB opt-in + cache — `null` = pas de paroles. */
export async function fetchLyricsByMeta(q: MetaLyricsQuery): Promise<LyricsData | null> {
  const t = q.title.trim();
  const a = q.artist.trim();
  if (!t || !a) return null;
  let url = `${BASE}/lyrics/by-meta?title=${encodeURIComponent(t)}&artist=${encodeURIComponent(a)}`;
  const album = q.album?.trim();
  if (album) url += `&album=${encodeURIComponent(album)}`;
  if (typeof q.durationSecs === 'number' && q.durationSecs > 0) {
    url += `&duration=${Math.round(q.durationSecs)}`;
  }
  try {
    return normalizeLyricsResponse(await fetchJSON<any>(url));
  } catch {
    return null;
  }
}

interface MetaTrack {
  id?: number | null;
  track_id?: number | null;
  source?: string | null;
  title?: string | null;
  artist_name?: string | null;
  album_title?: string | null;
  duration_ms?: number | null;
}

/** Requête paroles-par-métadonnées adaptée à une piste SANS id de
 *  bibliothèque, ou `null` si elle n'est pas éligible.
 *
 *  - Radio : titre + artiste, l'artiste ne devant pas être le simple nom de
 *    station (repli serveur quand le flux ne donne qu'un titre — `album_title`
 *    porte toujours le nom de station). Album/durée non fiables → omis ;
 *    l'ancrage temporel des paroles reste large (`radio: true`).
 *  - Streaming (Qobuz/Tidal…) : `current_track.id` est nul mais titre, artiste,
 *    album et durée sont présents → on les transmet pour un meilleur match, et
 *    la position de lecture réelle permet une synchro exacte (`radio: false`).
 *
 *  Une piste avec un id de bibliothèque exploitable relève de
 *  `fetchTrackLyrics` et rend `null` ici. */
export function metaLyricsQuery(track: MetaTrack | null | undefined): MetaLyricsQuery | null {
  if (!track) return null;
  // Un id de bibliothèque réel → endpoint par id, pas celui-ci.
  const libId = track.id ?? track.track_id ?? null;
  if (libId != null) return null;
  const title = track.title?.trim();
  const artist = track.artist_name?.trim();
  if (!title || !artist) return null;

  if (track.source === 'radio') {
    // Artiste == nom de station ⇒ pas de vraie métadonnée morceau.
    if (artist === track.album_title?.trim()) return null;
    return { title, artist, radio: true };
  }
  // Streaming : local/podcast ont un id, donc on ne tombe ici que pour une
  // source distante sans id (Qobuz, Tidal, Deezer, …).
  return {
    title,
    artist,
    album: track.album_title ?? null,
    durationSecs: track.duration_ms ? track.duration_ms / 1000 : null,
    radio: false,
  };
}

/** Compat : garde de l'ancien point d'entrée radio (délègue à metaLyricsQuery). */
export function radioTrackHasMeta(track: MetaTrack): boolean {
  return metaLyricsQuery(track)?.radio === true;
}

/** Ancrage local (repère `performance.now()`) du début du morceau radio.
 *  `ageMs` vient du serveur (`metadata_age_ms`, calculé sur SON horloge) :
 *  on soustrait l'âge du « maintenant » local, aucune comparaison
 *  d'horloges client/serveur n'entre en jeu. Sans âge serveur (événement WS
 *  optimiste), le changement vient d'arriver : l'ancrage est « maintenant ». */
export function radioAnchorFrom(ageMs: number | null | undefined, nowMs: number): number {
  return typeof ageMs === 'number' && ageMs >= 0 ? nowMs - ageMs : nowMs;
}
