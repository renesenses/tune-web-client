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
  return fetchJSON(`${BASE}/metadata/albums/${albumId}`, { method: 'PATCH', body: JSON.stringify(updates) });
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
  return fetchJSON<WriteTagsResult>(`${BASE}/metadata/tracks/${trackId}/write-tags`, { method: 'POST' });
}

export function writeAlbumTags(albumId: number) {
  return fetchJSON<WriteTagsResult>(`${BASE}/metadata/albums/${albumId}/write-tags`, { method: 'POST' });
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

export function renameArtist(oldName: string, newName: string, updateFiles = false) {
  return fetchJSON(`${BASE}/metadata/batch/rename-artist`, { method: 'POST', body: JSON.stringify({ old_name: oldName, new_name: newName, update_files: updateFiles }) });
}

// --- Lookup & enrichment ---

export function lookupTrack(title: string, artist = '', album = '') {
  return fetchJSON(`${BASE}/metadata/lookup?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`, { method: 'POST' });
}

export function lookupAlbum(title: string, artist = '') {
  return fetchJSON(`${BASE}/metadata/lookup-album?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`, { method: 'POST' });
}

export function enrichTrack(trackId: number) {
  return fetchJSON(`${BASE}/metadata/enrich/${trackId}`, { method: 'POST' });
}

export function enrichAlbum(albumId: number) {
  return fetchJSON(`${BASE}/metadata/enrich-album/${albumId}`, { method: 'POST' });
}

export function fetchAlbumCover(albumId: number) {
  return fetchJSON(`${BASE}/metadata/covers/album/${albumId}`, { method: 'POST' });
}

export function fingerprintTrack(trackId: number) {
  return fetchJSON(`${BASE}/metadata/fingerprint/${trackId}`, { method: 'POST' });
}

export function fingerprintBatch(trackIds?: number[], limit = 50) {
  return fetchJSON(`${BASE}/metadata/fingerprint-batch`, { method: 'POST', body: JSON.stringify(trackIds ? { track_ids: trackIds } : { limit }) });
}

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

export function getAutoFixReport(limit = 10) {
  return fetchJSON<unknown[]>(`${BASE}/metadata/auto-fix/report?limit=${limit}`);
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

export function getMetadataSuggestions(status = 'pending', limit = 100) {
  return fetchJSON(`${BASE}/metadata/suggestions?status=${status}&limit=${limit}`);
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

export function fixYearsMusicBrainz() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-musicbrainz`, { method: 'POST' });
}

export function fixYearsDiscogs() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-discogs`, { method: 'POST' });
}

export function fixYearsTidal() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-tidal`, { method: 'POST' });
}

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

export function fixYearsItunes() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-itunes`, { method: 'POST' });
}

export function mergeDuplicateAlbums() {
  return fetchJSON<MetadataFixResult>(`${BASE}/library/albums/merge-duplicates`, { method: 'POST' });
}

export function fixYearsWikidata() {
  return fetchJSON<MetadataFixResult>(`${BASE}/metadata/fix-years-wikidata`, { method: 'POST' });
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree }),
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

export function saveServiceToken(service: string, fields: Record<string, string>) {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${service}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

export function testServiceToken(service: string) {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${service}/test`, { method: 'POST' });
}

export function deleteServiceToken(service: string) {
  return fetchJSON<{ ok?: boolean }>(`${BASE}/services/tokens/${service}`, { method: 'DELETE' });
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

export function clearLibrary() {
  return fetchJSON(`${BASE}/system/library/clear`, { method: 'POST' });
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
  return fetchJSON<WriteAllResult>(`${BASE}/metadata/write-all-tags`, { method: 'POST' });
}

export function writeAllCovers() {
  return fetchJSON<WriteAllResult>(`${BASE}/metadata/write-all-covers`, { method: 'POST' });
}
