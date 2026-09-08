/** Adaptation des payloads doublons Tune vers le modèle du panneau (copie A / B). */

export interface CopiePiste {
  track_id: number;
  id: number;
  title: string;
  artist?: unknown;
  album?: unknown;
  path: string;
  file_path: string;
  format?: unknown;
  sample_rate?: unknown;
  bit_depth?: unknown;
  size?: unknown;
  genre?: unknown;
  year?: unknown;
  [key: string]: unknown;
}

export interface PaireDoublon {
  id: number;
  a: CopiePiste;
  b: CopiePiste;
  type: 'track';
  match_type?: string;
}

export function copiePiste(
  raw: Record<string, unknown>,
  titleFallback = '',
): CopiePiste {
  const id = Number(raw.id ?? raw.dup_id ?? 0);
  const path = String(raw.file_path ?? raw.path ?? raw.dup_path ?? '');
  const title = String(raw.title ?? titleFallback ?? '');
  const artist = raw.artist ?? raw.artist_name ?? raw.dup_artist_name;
  const album = raw.album ?? raw.album_title;
  return {
    ...raw,
    id,
    track_id: id,
    path,
    file_path: path,
    title,
    artist,
    album,
  };
}

export function paireDepuisSmart(d: {
  track_a?: Record<string, unknown>;
  track_b?: Record<string, unknown>;
}): PaireDoublon {
  const a = copiePiste(d.track_a ?? {});
  const b = copiePiste(d.track_b ?? {}, a.title);
  if (b.album == null && a.album != null) b.album = a.album;
  return { id: a.track_id, a, b, type: 'track', match_type: 'smart' };
}

function paireDepuisLigne(
  row: Record<string, unknown>,
  matchType: string,
): PaireDoublon {
  const a = copiePiste({
    id: row.id,
    title: row.title,
    artist_name: row.artist_name,
    file_path: row.file_path,
    duration_ms: row.duration_ms,
    format: row.format,
    sample_rate: row.sample_rate,
    bit_depth: row.bit_depth,
    size: row.size,
    genre: row.genre,
    year: row.year,
  });
  const b = copiePiste(
    {
      id: row.dup_id,
      title: row.title,
      artist_name: row.dup_artist_name,
      file_path: row.dup_path,
      duration_ms: row.duration_ms,
      format: row.dup_format,
      sample_rate: row.dup_sample_rate,
      bit_depth: row.dup_bit_depth,
      size: row.dup_size,
    },
    a.title,
  );
  return { id: a.track_id, a, b, type: 'track', match_type: matchType };
}

/** `GET /library/duplicates` rend un objet `{ by_hash, by_metadata, by_fingerprint }`.
 *  `GET /library/duplicates/smart` rend un tableau `{ track_a, track_b }`. */
export function flattenLibraryDuplicates(payload: unknown): PaireDoublon[] {
  if (payload == null || typeof payload !== 'object') return [];
  const dups = (payload as { duplicates?: unknown }).duplicates;
  if (Array.isArray(dups)) {
    return dups.map((d) =>
      paireDepuisSmart((d ?? {}) as { track_a?: Record<string, unknown>; track_b?: Record<string, unknown> }),
    );
  }
  if (dups == null || typeof dups !== 'object') return [];
  const bag = dups as {
    by_hash?: Record<string, unknown>[];
    by_metadata?: Record<string, unknown>[];
    by_fingerprint?: { tracks?: Record<string, unknown>[] }[];
  };
  const out: PaireDoublon[] = [];
  for (const row of bag.by_hash ?? []) {
    out.push(paireDepuisLigne(row, String(row.match_type ?? 'audio_hash')));
  }
  for (const g of bag.by_fingerprint ?? []) {
    const tracks = g.tracks ?? [];
    for (let i = 0; i < tracks.length - 1; i++) {
      const a = copiePiste(tracks[i] ?? {});
      const b = copiePiste(tracks[i + 1] ?? {}, a.title);
      out.push({ id: a.track_id, a, b, type: 'track', match_type: 'fingerprint' });
    }
  }
  for (const row of bag.by_metadata ?? []) {
    out.push(paireDepuisLigne(row, String(row.match_type ?? 'metadata')));
  }
  return out;
}

/** Le scan compte les empreintes audio ; on les montre en priorité.
 *  Sinon le rapprochement titre+artiste+durée (`smart`), sinon le reste. */
export function pairesAudioDabord(exact: PaireDoublon[], smart: PaireDoublon[]): PaireDoublon[] {
  const audio = exact.filter(
    (p) => p.match_type === 'audio_hash' || p.match_type === 'fingerprint',
  );
  if (audio.length > 0) return audio;
  if (smart.length > 0) return smart;
  return exact;
}
