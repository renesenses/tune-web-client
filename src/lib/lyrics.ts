// Récupération + normalisation des paroles d'une piste pour le mode Grand écran.
//
// L'endpoint serveur `GET /library/tracks/{id}/lyrics` existe sous deux formes :
//   - historique : `{ lyrics: string|null, synced: string|null (LRC brut), source }`
//   - nouvelle   : `{ synced: bool, source: string, lines: [{ t_ms: number|null, text }] }`
// Ce module accepte les deux et rend une forme unique. Toute erreur (404 piste
// sans paroles, 405 endpoint absent, réseau) est avalée et rend `null` : côté
// affichage, « pas de paroles » n'est jamais une erreur.

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

/** Charge et normalise les paroles d'une piste ; `null` = pas de paroles. */
export async function fetchTrackLyrics(trackId: number): Promise<LyricsData | null> {
  let r: any;
  try {
    r = await fetchJSON<any>(`${BASE}/library/tracks/${trackId}/lyrics`);
  } catch {
    // 404 (pas de paroles), 405 (endpoint pas encore déployé), réseau… :
    // comportement silencieux, l'affichage retombe sur « pochette seule ».
    return null;
  }
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
