// Endpoints autour de la gestion des métadonnées :
// - tags fichiers (lecture/écriture)
// - cleanup automatique (genres, années, fingerprint, doublons)
// - suggestions et auto-fix
// - genre tree, all-tags drawer, service tokens, MP3 diagnose
//
// Importé via la barrel `lib/api`.

import { BASE, fetchJSON } from './_client';

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

export function batchEditTracks(trackIds: number[], updates: Record<string, any>) {
  return fetchJSON(`${BASE}/metadata/batch/tracks`, { method: 'POST', body: JSON.stringify({ track_ids: trackIds, updates }) });
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

export function scanDuplicates() {
  return fetchJSON<DuplicateScanResult>(`${BASE}/metadata/duplicates/scan?limit=0`, { method: 'POST' });
}

export function listDuplicates() {
  return fetchJSON<unknown[]>(`${BASE}/metadata/duplicates`);
}

export function moveAlbumToDuplicates(albumId: number) {
  return fetchJSON(`${BASE}/metadata/duplicates/move-album?album_id=${albumId}`, { method: 'POST' });
}

export function resolveDuplicate(duplicateId: number, keepTrackId: number) {
  return fetchJSON(`${BASE}/metadata/duplicates/resolve?duplicate_id=${duplicateId}&keep_track_id=${keepTrackId}`, { method: 'POST' });
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

export function acceptAllSuggestions(minConfidence = 0.9) {
  return fetchJSON(`${BASE}/metadata/suggestions/accept-all?min_confidence=${minConfidence}`, { method: 'POST' });
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

export function autoFixAlbums() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/auto-fix-albums`, { method: 'POST' });
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

export function getTrackAllTags(trackId: number): Promise<TrackAllTags> {
  return fetchJSON(`${BASE}/library/tracks/${trackId}/all-tags`);
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
