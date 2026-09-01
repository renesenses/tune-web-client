// Endpoints autour de la gestion des métadonnées :
// - tags fichiers (lecture/écriture)
// - cleanup automatique (genres, années, fingerprint, doublons)
// - suggestions et auto-fix
// - genre tree, all-tags drawer, service tokens, MP3 diagnose
//
// Importé via la barrel `lib/api`.

import { BASE, fetchJSON } from './_client';
import {
  flattenLibraryDuplicates,
  pairesAudioDabord,
  type PaireDoublon,
} from './duplicate-pairs';

export type { PaireDoublon } from './duplicate-pairs';

// --- Update single album/track ---

export function updateTrackMetadata(trackId: number, updates: Record<string, any>) {
  return fetchJSON(`${BASE}/metadata/tracks/${trackId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function updateAlbumMetadata(albumId: number, updates: Record<string, any>) {
  // PATCH /metadata/albums/{id} n'a jamais existé sur le serveur Rust → le
  // « Valider » des albums douteux échouait en silence. PUT /library/albums
  // accepte les mêmes champs (title, artist_name, genre, year, label…).
  return fetchJSON(`${BASE}/library/albums/${albumId}`, { method: 'PUT', body: JSON.stringify(updates) });
}

// --- Write tags to disk ---

export interface WriteTagsResult {
  ok?: boolean;
  success?: boolean;
  written?: number;
  tracks_processed?: number;
  errors?: number;
  message?: string;
  details?: unknown[];
}

export function writeTrackTags(trackId: number) {
  // The real endpoint is the bulk /library/write-tags (there is no
  // /metadata/tracks/{id}/write-tags — it 404'd). Scope it to one track.
  return fetchJSON<WriteTagsResult>(`${BASE}/library/write-tags`, {
    method: 'POST',
    body: JSON.stringify({ track_ids: [trackId], only_missing: false }),
  });
}

export function writeAlbumTags(albumId: number) {
  // Scope the bulk /library/write-tags endpoint to one album (album_id).
  return fetchJSON<WriteTagsResult>(`${BASE}/library/write-tags`, {
    method: 'POST',
    body: JSON.stringify({ album_id: albumId, only_missing: false }),
  });
}

// --- Bulk operations ---

export interface MergeAlbumsResult {
  master_id: number;
  total_tracks: number;
  tracks_moved: number;
  merged_ids?: number[];
  [key: string]: unknown;
}

export function mergeAlbums(albumIds: number[]) {
  return fetchJSON<MergeAlbumsResult>(`${BASE}/metadata/albums/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ album_ids: albumIds }),
  });
}

// --- Lookup & enrichment ---
// lookupTrack/lookupAlbum, enrichTrack/enrichAlbum, fetchAlbumCover et
// fingerprint* : jamais appelés depuis un composant (retirés — la refonte
// passe par /library/enrich-all et les endpoints /library/…).

// --- Auto-fix workflow ---

export interface AutoFixStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  current: number;
  total: number;
  fixed: number;
  suggestions: number;
  [key: string]: unknown;
}

export interface DuplicateScanResult {
  total_scanned: number;
  duplicates_found: number;
  [key: string]: unknown;
}

export function startAutoFix() {
  return fetchJSON<{ ok?: boolean; status?: string }>(`${BASE}/metadata/auto-fix`, { method: 'POST' });
}

export function getAutoFixStatus() {
  return fetchJSON<AutoFixStatus>(`${BASE}/metadata/auto-fix/status`);
}

/** Le chemin réel des doublons.
 *
 *  Tout l'écran appelait `/metadata/duplicates…` — quatre routes qui n'ont
 *  jamais existé (#1893). Mesuré sur un serveur 0.9.88 : les quatre répondent
 *  404, tandis que `/library/duplicates`, `/library/duplicates/smart` et
 *  `/library/duplicates/resolve` répondent. La fonction existait ; c'est
 *  l'adresse qui était fausse. */
const DUP = `${BASE}/library/duplicates`;

/** `duplicates/smart` compare titre + artiste + durée (±3 s). Rapide.
 *  Ce n'est pas le même compteur que le scan (empreinte audio). */
async function paires(limit = 200): Promise<PaireDoublon[]> {
  const r = await fetchJSON<{ count?: number; duplicates?: unknown[] }>(
    `${DUP}/smart?limit=${limit}`,
  );
  return flattenLibraryDuplicates(r);
}

/** `GET /library/duplicates` — hash / métadonnées / fingerprint.
 *  Le scan écrit `audio_hash` ; cette liste est celle des 9 « trouvés ».
 *  Lent : chaque paire hash est relue sur disque (octet à octet). */
export async function listExactDuplicatePairs(limit = 200): Promise<PaireDoublon[]> {
  const r = await fetchJSON<unknown>(`${DUP}?limit=${limit}`);
  return flattenLibraryDuplicates(r);
}

/** Le scan est désormais une VRAIE opération serveur.
 *
 *  Il ne l'était pas quand cette fonction a été écrite, d'où les compteurs
 *  fabriqués à partir de la liste : `paires × 2` annonçait « 40 pistes
 *  analysées » sur une bibliothèque de 50 000. Le chiffre affiché à côté du
 *  nombre de doublons était donc faux, et faux vers le bas — de quoi croire
 *  que le scan n'avait presque rien regardé.
 *
 *  `POST /library/duplicates/scan` existe depuis tune-server-rust#2018. Il
 *  parcourt la bibliothèque, CALCULE l'empreinte audio des pistes qui n'en ont
 *  pas et la persiste — ce que rien ne faisait après l'indexation initiale —
 *  puis rend le compte réel. C'est ce qui rend la recherche exacte capable de
 *  trouver quelque chose sur une bibliothèque ancienne.
 *
 *  Repli sur les compteurs dérivés si le serveur est plus vieux que #2018 :
 *  l'écran continue d'afficher un résultat plutôt qu'une erreur. */
export async function scanDuplicates(): Promise<DuplicateScanResult> {
  try {
    return await fetchJSON<DuplicateScanResult>(`${DUP}/scan`, { method: 'POST' });
  } catch {
    const p = await paires();
    return { total_scanned: p.length * 2, duplicates_found: p.length };
  }
}

export function listDuplicates(): Promise<PaireDoublon[]> {
  return paires();
}

/** Après le toast du scan : montrer tout de suite les paires `smart`, puis
 *  remplacer par les empreintes audio si `GET /library/duplicates` en trouve
 *  (c'est ce compteur-là que le scan annonce — 9, pas les 300 homonymes). */
export async function refineDuplicatePairs(smart: PaireDoublon[]): Promise<PaireDoublon[]> {
  try {
    const exact = await listExactDuplicatePairs(500);
    return pairesAudioDabord(exact, smart);
  } catch {
    return smart;
  }
}

/** Résoudre : garder une copie, supprimer l'autre.
 *
 *  Le serveur attend `{keep_id, delete_id}` dans le CORPS — deux identifiants
 *  de PISTE. L'ancien appel envoyait un `duplicate_id` et un `keep_track_id`
 *  en paramètres d'URL, sur une route absente : ni le chemin, ni la forme, ni
 *  le transport n'étaient justes. */
export function resolveDuplicate(keepTrackId: number, deleteTrackId: number) {
  return fetchJSON(`${DUP}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ keep_id: keepTrackId, delete_id: deleteTrackId }),
  });
}

/** Ne renvoie qu'un **compteur**, pas la liste : `{ pending: n }` (routes/
 *  metadata.rs list_suggestions). Les paramètres status/limit sont ignorés côté
 *  serveur. Il n'existe pas d'endpoint listant toutes les suggestions — seul
 *  /metadata/tracks/{id}/suggestions existe, par piste. */
export function getMetadataSuggestions(status = 'pending', limit = 100) {
  return fetchJSON<{ pending: number }>(`${BASE}/metadata/suggestions?status=${status}&limit=${limit}`);
}

export function acceptSuggestion(id: number) {
  return fetchJSON(`${BASE}/metadata/suggestions/${id}/accept`, { method: 'POST' });
}

export function rejectSuggestion(id: number) {
  return fetchJSON(`${BASE}/metadata/suggestions/${id}/reject`, { method: 'POST' });
}

/**
 * Applique d'un coup toutes les suggestions au-dessus d'un seuil de confiance.
 *
 * Appelait `/suggestions/accept-all?min_confidence=…`, une route qui n'a jamais
 * existé côté serveur : 404 à chaque clic (#1893). La fonction, elle, existe
 * bien — sous le nom `/suggestions/auto-apply`, et avec le seuil dans le CORPS
 * de la requête, pas dans l'URL. Ce n'est donc pas une route à écrire, c'est un
 * appel à corriger.
 */
export function acceptAllSuggestions(minConfidence = 0.9) {
  return fetchJSON(`${BASE}/metadata/suggestions/auto-apply`, {
    method: 'POST',
    body: JSON.stringify({ threshold: minConfidence }),
  });
}

// --- Cleanup helpers (years / genres / merge) ---

export interface MetadataFixResult {
  total?: number;
  fixed?: number;
  skipped?: number;
  skipped_low_coherence?: number;
  skipped_no_known_genre?: number;
  errors?: number;
  not_found?: number;
  failed?: number;
  repaired?: number;
  requested?: number;
  details?: unknown[];
  [key: string]: unknown;
}

// Online year sources (MusicBrainz/Discogs/Tidal/iTunes/Wikidata) are not
// implemented on the Rust server (only fix-years-tags and fix-years-from-path
// exist), so their endpoints 404'd — removed with their buttons (#1089).

export function fixYearsTags() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-tags`, { method: 'POST' });
}

export function fixGenres() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-genres`, { method: 'POST' });
}

export function fixYearsFromPath() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-from-path`, { method: 'POST' });
}

export function reclassifyGenresByPath(dryRun: boolean = false) {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/reclassify-genres-by-path?dry_run=${dryRun}`, { method: 'POST' });
}

export function mergeDuplicateAlbums() {
  return fetchJSON<MetadataFixResult>(`${BASE}/library/albums/merge-duplicates`, { method: 'POST' });
}

export function fixGenresByArtist(minCoherence = 0.7) {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-genres-by-artist?min_coherence=${minCoherence}`, { method: 'POST' });
}

export function fixGenresByArtistFuzzy(minCoherence = 0.7) {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-genres-by-artist-fuzzy?min_coherence=${minCoherence}`, { method: 'POST' });
}

export function fixGenresByFamily(minCoherence = 0.7) {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-genres-by-family?min_coherence=${minCoherence}`, { method: 'POST' });
}

// --- Genre tree ---

export interface GenreTreeResponse {
  tree: Record<string, string[]>;
}

export function getGenreTree(): Promise<GenreTreeResponse> {
  return fetchJSON(`${BASE}/library/genre-tree`);
}

export function putGenreTree(tree: Record<string, string[]>): Promise<GenreTreeResponse> {
  return fetchJSON(`${BASE}/library/genre-tree`, {
    method: 'PUT',
    body: JSON.stringify({ tree }),
  });
}

export interface GenreRenameResult {
  albums: number;
  tracks: number;
  unchanged?: boolean;
}

/**
 * Rename a genre across the WHOLE library: rewrites the `genre`/`genres` columns
 * on every matching album AND track (canonical, case/separator-insensitive), and
 * renames the branch in the saved genre-tree. If `to` already exists it becomes a
 * MERGE (e.g. "Rok" → "Rock"). This actually fixes a mis-spelled genre on the
 * tags, unlike editing the tree overlay alone, which left the bad genre on the
 * tracks so it kept reappearing (forum "Arbre des genres", Jean Marie).
 */
export function renameGenre(from: string, to: string): Promise<GenreRenameResult> {
  return fetchJSON(`${BASE}/library/genres/rename`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

// --- Track all-tags drawer ---

export interface TrackAllTags {
  track_id: number;
  file_path: string | null;
  file_exists: boolean;
  db_fields: Record<string, any>;
  db_credits: any[];
  file_tags: Record<string, string[]>;
  audio_info: Record<string, any>;
}

const ALL_TAGS_NESTED = new Set([
  'db_fields', 'db_credits', 'file_tags', 'audio_info', 'track_id', 'file_exists',
]);

const ALL_TAGS_AUDIO = [
  'format', 'sample_rate', 'bit_depth', 'channels', 'duration_ms', 'file_size',
] as const;

function formatTagLeaf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The Rust `/all-tags` handler returns the Track row plus `file_tags` as
 *  `[{tag_type, items: string[]}]`. The drawer expects `db_fields` +
 *  `file_tags: Record<string, string[]>`. Rendering the raw array with
 *  `vals.join()` threw and Svelte kept the first "Chargement…" frame. */
export function normalizeTrackAllTags(raw: unknown, trackId: number): TrackAllTags {
  const src = raw && typeof raw === 'object' ? raw as Record<string, any> : {};

  const nestedDb = src.db_fields && typeof src.db_fields === 'object' && !Array.isArray(src.db_fields)
    ? { ...src.db_fields }
    : null;

  const db_fields: Record<string, any> = nestedDb ?? {};
  if (!nestedDb) {
    for (const [key, value] of Object.entries(src)) {
      if (ALL_TAGS_NESTED.has(key)) continue;
      db_fields[key] = value;
    }
  }

  if (db_fields.comment == null && db_fields.comments != null) {
    db_fields.comment = db_fields.comments;
  }
  if (db_fields.mtime == null && db_fields.file_mtime != null) {
    db_fields.mtime = db_fields.file_mtime;
  }
  if (db_fields.mb_recording_id == null && db_fields.musicbrainz_recording_id != null) {
    db_fields.mb_recording_id = db_fields.musicbrainz_recording_id;
  }

  let audio_info: Record<string, any> =
    src.audio_info && typeof src.audio_info === 'object' && !Array.isArray(src.audio_info)
      ? { ...src.audio_info }
      : {};
  if (Object.keys(audio_info).length === 0) {
    for (const key of ALL_TAGS_AUDIO) {
      if (src[key] != null) audio_info[key] = src[key];
    }
  }

  return {
    track_id: src.track_id ?? src.id ?? db_fields.id ?? trackId,
    file_path: src.file_path ?? db_fields.file_path ?? null,
    file_exists: typeof src.file_exists === 'boolean' ? src.file_exists : src.file_exists !== false,
    db_fields,
    db_credits: Array.isArray(src.db_credits) ? src.db_credits : [],
    file_tags: normalizeFileTags(src.file_tags),
    audio_info,
  };
}

export function normalizeFileTags(raw: unknown): Record<string, string[]> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string[]> = {};
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        const leaf = formatTagLeaf(entry);
        if (leaf) (out['tag'] ??= []).push(leaf);
        continue;
      }
      const rec = entry as Record<string, unknown>;
      const tagType = String(rec.tag_type ?? rec.tagType ?? 'tag');
      const items = rec.items;
      const vals = Array.isArray(items)
        ? items.map(formatTagLeaf).filter(Boolean)
        : [formatTagLeaf(entry)].filter(Boolean);
      if (vals.length) out[tagType] = [...(out[tagType] ?? []), ...vals];
    }
    return out;
  }
  if (typeof raw === 'object') {
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.map(formatTagLeaf).filter(Boolean);
      else {
        const leaf = formatTagLeaf(value);
        if (leaf) out[key] = [leaf];
      }
    }
    return out;
  }
  return {};
}

export async function getTrackAllTags(trackId: number): Promise<TrackAllTags> {
  const raw = await fetchJSON<unknown>(`${BASE}/library/tracks/${trackId}/all-tags`);
  return normalizeTrackAllTags(raw, trackId);
}

// --- Service tokens (Discogs/Last.fm/etc.) ---

export interface ServiceTokenInfo {
  id: string;
  name: string;
  kind: 'no_auth' | 'personal_token' | 'api_key' | 'oauth' | 'login_password' | 'arl_token';
  purpose: string;
  pricing: 'free' | 'paid' | 'freemium' | 'unknown';
  pricing_note: string;
  fields: { key: string; label: string; type: string }[];
  help_url: string;
  help_steps: string[];
  configured: boolean;
  source: 'db' | 'env' | null;
  valid: boolean | null;
  validated_at: number | null;
  validation_message: string | null;
  // Last.fm scrobbling extras (only present when id === 'lastfm')
  scrobble_enabled?: boolean;
  scrobble_authenticated?: boolean;
  lastfm_username?: string;
}

export interface ServiceTokenSaveResult {
  ok?: boolean;
  valid?: boolean;
  message?: string;
  error?: string;
  validation_message?: string;
  validated_at?: number;
}

export function listServiceTokens(): Promise<ServiceTokenInfo[]> {
  return fetchJSON(`${BASE}/services/tokens`);
}

// `service` est encodé : c'était le seul apport du doublon supprimé d'api.ts.
export function saveServiceToken(service: string, fields: Record<string, string>) {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${encodeURIComponent(service)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

export function testServiceToken(service: string) {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${encodeURIComponent(service)}/test`, { method: 'POST' });
}

export function deleteServiceToken(service: string) {
  return fetchJSON<{ ok?: boolean }>(`${BASE}/services/tokens/${encodeURIComponent(service)}`, { method: 'DELETE' });
}

// --- Last.fm scrobbling ---

export interface LastfmAuthToken {
  token: string;
  auth_url: string;
}

export interface LastfmSessionResult {
  ok: boolean;
  session_key: string;
  username: string;
  scrobble_enabled: boolean;
}

export function lastfmGetAuthToken() {
  return fetchJSON<LastfmAuthToken>(`${BASE}/services/lastfm/auth/token`, { method: 'POST' });
}

export function lastfmGetSession(token: string) {
  return fetchJSON<LastfmSessionResult>(`${BASE}/services/lastfm/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export function lastfmToggleScrobble(enabled: boolean) {
  return fetchJSON<{ ok: boolean; scrobble_enabled: boolean }>(`${BASE}/services/lastfm/scrobble/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function lastfmDisconnect() {
  return fetchJSON<{ ok: boolean }>(`${BASE}/services/lastfm/disconnect`, { method: 'POST' });
}

// --- MP3 diagnose & repair ---

export interface Mp3DiagnoseResult {
  total?: number;
  ok?: number;
  ok_files?: number;
  scanned?: number;
  warnings?: number;
  errors?: number;
  issues?: Array<{ track_id: number; path?: string; issues?: string[] }>;
  issues_found?: number;
  missing_files?: number;
  problematic?: Array<{ track_id: number; path?: string; issues?: string[] }>;
  [key: string]: unknown;
}

export function diagnoseMp3() {
  return fetchJSON<Mp3DiagnoseResult>(`${BASE}/metadata/mp3/diagnose`, { method: 'POST' });
}

export interface Mp3RepairResult {
  repaired?: number;
  requested?: number;
  failed?: Array<{ track_id?: number; error?: string }>;
  skipped?: number;
  [key: string]: unknown;
}

export function repairMp3(trackIds: number[]) {
  return fetchJSON<Mp3RepairResult>(`${BASE}/metadata/mp3/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
}

// --- Misc ---

/** Reponse de `POST /system/library/clear` : le serveur repond 200 meme en cas
 *  d'echec, avec `ok: false` et le message. Voir #1715. */
export interface ClearLibraryResult {
  ok: boolean;
  deleted?: number;
  error?: string;
}

export function clearLibrary(): Promise<ClearLibraryResult> {
  return fetchJSON<ClearLibraryResult>(`${BASE}/system/library/clear`, { method: 'POST' });
}

export interface WriteAllResult {
  updated?: number;
  written?: number;
  skipped?: number;
  errors?: number;
  total?: number;
  [key: string]: unknown;
}

export function writeAllTags() {
  // Canonical bulk endpoint (async job + /library/write-tags/status). The old
  // /metadata/write-all-tags survived the Python server only as a 404 until
  // the server aliased it back — call the real thing directly.
  return fetchJSON<WriteAllResult>(`${BASE}/library/write-tags`, {
    method: 'POST',
    body: JSON.stringify({ only_missing: true }),
  });
}

// --- Rescan metadata from file tags ---

export interface RescanMetadataResult {
  status: string;
  result?: {
    total?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  };
}

export function rescanMetadata() {
  return fetchJSON<{ status: string }>(`${BASE}/library/rescan-metadata`, { method: 'POST' });
}

export function rescanMetadataStatus() {
  return fetchJSON<RescanMetadataResult>(`${BASE}/library/rescan-metadata/status`);
}

// --- Extended metadata (per-track key-value store) ---

export interface MetadataFieldDef {
  key: string;
  label: string;
  enabled: boolean;
  /** Which entity the field belongs to. Absent on servers < v0.9.52. */
  scope?: 'track' | 'album' | 'both';
}

export interface MetadataCategory {
  name: string;
  fields: MetadataFieldDef[];
}

export interface MetadataFieldsResponse {
  categories: MetadataCategory[];
}

/** Fetch the user's metadata-fields configuration (which extended fields are visible). */
export function getMetadataFieldSettings(): Promise<MetadataFieldsResponse> {
  return fetchJSON(`${BASE}/system/settings/metadata-fields`);
}

/** Get all extended metadata key-value pairs for a track. */
export function getTrackExtendedMetadata(trackId: number): Promise<Record<string, string>> {
  return fetchJSON(`${BASE}/library/tracks/${trackId}/metadata`);
}

/** Batch-set extended metadata fields on a track. */
export function updateTrackExtendedMetadata(trackId: number, fields: Record<string, string>): Promise<any> {
  return fetchJSON(`${BASE}/library/tracks/${trackId}/metadata`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

// --- Extended metadata (per-album key-value store) ---

/** Get all extended metadata key-value pairs for an album. */
export function getAlbumExtendedMetadata(albumId: number): Promise<Record<string, string>> {
  return fetchJSON(`${BASE}/library/albums/${albumId}/metadata`);
}

/** Batch-set album-level extended metadata (DB only; file tags go through write-tags). */
export function updateAlbumExtendedMetadata(albumId: number, fields: Record<string, string>): Promise<any> {
  return fetchJSON(`${BASE}/library/albums/${albumId}/metadata`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}
