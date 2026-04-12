// REST API client for tune-server

import type {
  Zone,
  Track,
  Album,
  Artist,
  Playlist,
  DiscoveredDevice,
  QueueStateResponse,
  SearchResult,
  FederatedSearchResult,
  FeaturedSection,
  SystemHealth,
  SystemStats,
  StreamingServiceStatus,
  StreamingAuthResponse,
  ZoneGroupResponse,
  LocalAudioDevice,
  CompletenessStats,
  ArtworkRescanResult,
  Source,
  RepeatMode,
  OutputType,
} from './types';

const BASE = '/api/v1';

// Generic helpers for radio favorites and custom endpoints
export async function apiFetch(path: string): Promise<any> {
  const resp = await fetch(`${BASE}${path}`);
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

export async function apiPost(path: string, body?: any): Promise<any> {
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

export async function apiDelete(path: string): Promise<any> {
  const resp = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

async function apiError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body.detail) detail = body.detail;
  } catch { /* ignore */ }
  return new Error(detail);
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json();
}

async function fetchVoid(url: string, options?: RequestInit): Promise<void> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw await apiError(response);
  }
}

// --- Zones ---

export function getZones() {
  return fetchJSON<Zone[]>(`${BASE}/zones`);
}

export function getZone(id: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`);
}

export function createZone(name: string, outputType: OutputType = 'local', outputDeviceId?: string) {
  return fetchJSON<Zone>(`${BASE}/zones`, {
    method: 'POST',
    body: JSON.stringify({ name, output_type: outputType, output_device_id: outputDeviceId }),
  });
}

export function renameZone(id: number, name: string) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function updateZoneSyncDelay(id: number, syncDelayMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ sync_delay_ms: syncDelayMs }),
  });
}

// --- Devices ---

export function getDevices() {
  return fetchJSON<DiscoveredDevice[]>(`${BASE}/devices`);
}

export function getDevice(id: string) {
  return fetchJSON<DiscoveredDevice>(`${BASE}/devices/${encodeURIComponent(id)}`);
}

export function getAudioDevices() {
  return fetchJSON<LocalAudioDevice[]>(`${BASE}/devices/audio`);
}

export function beginPairing(deviceId: string) {
  return fetchJSON<{ status: string; device_id: string; message?: string }>(`${BASE}/devices/${encodeURIComponent(deviceId)}/pair`, { method: 'POST' });
}

export function submitPairingPin(deviceId: string, pin: string) {
  return fetchJSON<{ status: string; device_id: string; message?: string }>(`${BASE}/devices/${encodeURIComponent(deviceId)}/pair/pin`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function deleteZone(id: number) {
  return fetchVoid(`${BASE}/zones/${id}`, { method: 'DELETE' });
}

// --- Zone Groups ---

export function groupZones(leaderZoneId: number, zoneIds: number[]) {
  return fetchJSON<ZoneGroupResponse>(`${BASE}/zones/group`, {
    method: 'POST',
    body: JSON.stringify({ leader_id: leaderZoneId, zone_ids: zoneIds }),
  });
}

export function ungroupZones(groupId: string) {
  return fetchVoid(`${BASE}/zones/group/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export function listGroups() {
  return fetchJSON<ZoneGroupResponse[]>(`${BASE}/zones/groups/list`);
}

// --- Playback ---

export function play(zoneId: number, body?: { track_id?: number; track_ids?: number[]; album_id?: number; playlist_id?: number; source?: Source; source_id?: string; streaming_album_id?: string; streaming_playlist_id?: string; file_path?: string }) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/play`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function pause(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/pause`, { method: 'POST' });
}

export function resume(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/resume`, { method: 'POST' });
}

export function stop(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/stop`, { method: 'POST' });
}

export function next(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/next`, { method: 'POST' });
}

export function previous(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/previous`, { method: 'POST' });
}

export function seek(zoneId: number, positionMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/seek`, {
    method: 'POST',
    body: JSON.stringify({ position_ms: positionMs }),
  });
}

export function setVolume(zoneId: number, volume: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/volume`, {
    method: 'POST',
    body: JSON.stringify({ volume }),
  });
}

export function setShuffle(zoneId: number, enabled: boolean) {
  return fetchJSON<{ shuffle: boolean }>(`${BASE}/zones/${zoneId}/shuffle?enabled=${enabled}`, {
    method: 'POST',
  });
}

export function setRepeat(zoneId: number, mode: RepeatMode) {
  return fetchJSON<{ repeat: RepeatMode }>(`${BASE}/zones/${zoneId}/repeat?mode=${mode}`, {
    method: 'POST',
  });
}

// --- Queue ---

export function getQueue(zoneId: number) {
  return fetchJSON<QueueStateResponse>(`${BASE}/zones/${zoneId}/queue`);
}

export function addToQueue(zoneId: number, body: { track_id?: number; track_ids?: number[]; album_id?: number; source?: Source; source_id?: string; file_path?: string; position?: number }) {
  return fetchJSON<{ queue_length: number }>(`${BASE}/zones/${zoneId}/queue/add`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeFromQueue(zoneId: number, index: number) {
  return fetchJSON<{ queue_length: number }>(`${BASE}/zones/${zoneId}/queue/${index}`, {
    method: 'DELETE',
  });
}

export function jumpInQueue(zoneId: number, position: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/queue/jump`, {
    method: 'POST',
    body: JSON.stringify({ position }),
  });
}

export function moveInQueue(zoneId: number, fromPosition: number, toPosition: number) {
  return fetchJSON<{ queue_length: number }>(`${BASE}/zones/${zoneId}/queue/move`, {
    method: 'POST',
    body: JSON.stringify({ from_position: fromPosition, to_position: toPosition }),
  });
}

export function clearQueue(zoneId: number) {
  return fetchJSON<{ queue_length: number }>(`${BASE}/zones/${zoneId}/queue/clear`, {
    method: 'POST',
  });
}

// --- Library ---

export function getAlbums(limit = 100, offset = 0) {
  return fetchJSON<Album[]>(`${BASE}/library/albums?limit=${limit}&offset=${offset}`);
}

export function getRecentAlbums(limit = 50) {
  return fetchJSON<Album[]>(`${BASE}/library/albums/recent?limit=${limit}`);
}

export async function getAllAlbums(pageSize = 2000): Promise<Album[]> {
  const all: Album[] = [];
  let offset = 0;
  while (true) {
    const batch = await fetchJSON<Album[]>(`${BASE}/library/albums?limit=${pageSize}&offset=${offset}`);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function getAlbum(id: number) {
  return fetchJSON<Album>(`${BASE}/library/albums/${id}`);
}

export function getAlbumTracks(id: number) {
  return fetchJSON<Track[]>(`${BASE}/library/albums/${id}/tracks`);
}

export function getArtists(limit = 100, offset = 0) {
  return fetchJSON<Artist[]>(`${BASE}/library/artists?limit=${limit}&offset=${offset}`);
}

export async function getAllArtists(pageSize = 2000): Promise<Artist[]> {
  const all: Artist[] = [];
  let offset = 0;
  while (true) {
    const batch = await getArtists(pageSize, offset);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function createArtist(name: string) {
  return fetchJSON<Artist>(`${BASE}/library/artists`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function getArtist(id: number) {
  return fetchJSON<Artist>(`${BASE}/library/artists/${id}`);
}

export function getArtistAlbums(id: number) {
  return fetchJSON<Album[]>(`${BASE}/library/artists/${id}/albums`);
}

export function getArtistTracks(id: number) {
  return fetchJSON<Track[]>(`${BASE}/library/artists/${id}/tracks`);
}

export function getTracks(limit = 100, offset = 0) {
  return fetchJSON<Track[]>(`${BASE}/library/tracks?limit=${limit}&offset=${offset}`);
}

export async function getAllTracks(pageSize = 2000): Promise<Track[]> {
  const all: Track[] = [];
  let offset = 0;
  while (true) {
    const batch = await fetchJSON<Track[]>(`${BASE}/library/tracks?limit=${pageSize}&offset=${offset}`);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function searchLibrary(q: string, limit = 50) {
  return fetchJSON<SearchResult>(`${BASE}/library/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function getLibraryStats() {
  return fetchJSON<{ tracks: number; albums: number; artists: number }>(`${BASE}/library/stats`);
}

export function updateAlbum(id: number, data: { title?: string; artist_id?: number; year?: number; genre?: string }) {
  return fetchJSON<Album>(`${BASE}/library/albums/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateTrack(id: number, data: { title?: string; album_id?: number; artist_id?: number; disc_number?: number; track_number?: number; genre?: string; year?: string }) {
  return fetchJSON<Track>(`${BASE}/library/tracks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateArtist(id: number, data: { name?: string; sort_name?: string; bio?: string }) {
  return fetchJSON<Artist>(`${BASE}/library/artists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function uploadAlbumArtwork(albumId: number, file: File): Promise<Album> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE}/library/albums/${albumId}/artwork`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw await apiError(response);
  }
  return response.json();
}

export function rescanAlbumArtwork(albumId: number) {
  return fetchJSON<ArtworkRescanResult>(`${BASE}/library/albums/${albumId}/artwork/rescan`, {
    method: 'POST',
  });
}

export function getCompletenessStats() {
  return fetchJSON<CompletenessStats>(`${BASE}/library/stats/completeness`);
}

// --- Browse (directory navigation) ---

export function getBrowseRoots() {
  return fetchJSON<import('./types').BrowseRootsResponse>(`${BASE}/library/browse`);
}

export function browseDirectory(path: string) {
  return fetchJSON<import('./types').BrowseResult>(`${BASE}/library/browse/dir?path=${encodeURIComponent(path)}`);
}

// --- Media Servers (UPnP/DLNA) ---

export function getMediaServers() {
  return fetchJSON<import('./types').MediaServer[]>(`${BASE}/network/media-servers`);
}

export function browseMediaServer(serverId: string, objectId: string = '0') {
  return fetchJSON<import('./types').MediaServerBrowseResult>(
    `${BASE}/network/media-servers/${encodeURIComponent(serverId)}/browse?object_id=${encodeURIComponent(objectId)}`
  );
}

export function getMediaServerItemStreamUrl(serverId: string, itemId: string) {
  return fetchJSON<{ url: string }>(
    `${BASE}/network/media-servers/${encodeURIComponent(serverId)}/item/${encodeURIComponent(itemId)}/stream-url`
  );
}

export function playMediaServerItem(serverId: string, itemId: string, zoneId: number) {
  return fetchJSON<import('./types').Zone>(
    `${BASE}/network/media-servers/${serverId}/item/${itemId}/play/${zoneId}`,
    { method: 'POST' }
  );
}

// --- Playlists ---

export function getPlaylists(limit = 100, offset = 0) {
  return fetchJSON<Playlist[]>(`${BASE}/playlists?limit=${limit}&offset=${offset}`);
}

export function getPlaylist(id: number) {
  return fetchJSON<Playlist>(`${BASE}/playlists/${id}`);
}

export function createPlaylist(name: string, description?: string) {
  return fetchJSON<Playlist>(`${BASE}/playlists`, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export function updatePlaylist(id: number, data: { name?: string; description?: string }) {
  return fetchJSON<Playlist>(`${BASE}/playlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deletePlaylist(id: number) {
  return fetchVoid(`${BASE}/playlists/${id}`, { method: 'DELETE' });
}

export function getPlaylistTracks(id: number) {
  return fetchJSON<Track[]>(`${BASE}/playlists/${id}/tracks`);
}

export function addPlaylistTracks(id: number, trackIds: number[], position?: number, streamingTracks?: import('./types').StreamingTrackInfo[]) {
  return fetchJSON<Playlist>(`${BASE}/playlists/${id}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds, position, streaming_tracks: streamingTracks }),
  });
}

export function removePlaylistTrack(playlistId: number, trackId: number) {
  return fetchVoid(`${BASE}/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
}

export function reorderPlaylistTracks(playlistId: number, trackIds: number[]) {
  return fetchVoid(`${BASE}/playlists/${playlistId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds }),
  });
}

// --- Search ---

export function federatedSearch(q: string, sources?: string[], limit = 20) {
  let url = `${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  if (sources && sources.length > 0) {
    url += `&sources=${sources.join(',')}`;
  }
  return fetchJSON<FederatedSearchResult>(url);
}

// --- System ---

export function getHealth() {
  return fetchJSON<SystemHealth>(`${BASE}/system/health`);
}

export function getStats() {
  return fetchJSON<SystemStats>(`${BASE}/system/stats`);
}

export function getConfig() {
  return fetchJSON<any>(`${BASE}/system/config`);
}

export function updateConfig(fields: Record<string, unknown>) {
  return fetchJSON<Record<string, unknown>>(`${BASE}/system/config`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export function addMusicDir(path: string) {
  return fetchJSON<{ music_dirs: string[] }>(`${BASE}/system/music-dirs`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export function removeMusicDir(path: string) {
  return fetchJSON<{ music_dirs: string[] }>(`${BASE}/system/music-dirs`, {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  });
}

export function triggerScan(path?: string) {
  const url = path ? `${BASE}/system/scan?path=${encodeURIComponent(path)}` : `${BASE}/system/scan`;
  return fetchJSON<{ status: string; music_dirs: string[] }>(url, { method: 'POST' });
}

export function getScanStatus() {
  return fetchJSON<{ scanning: boolean }>(`${BASE}/system/scan/status`);
}

export function getBackups() {
  return fetchJSON<import('./types').BackupInfo[]>(`${BASE}/system/backups`);
}

export function createBackup() {
  return fetchJSON<import('./types').BackupInfo>(`${BASE}/system/backups`, { method: 'POST' });
}

export function restoreBackup(filename: string) {
  return fetchJSON<{ restored: boolean }>(`${BASE}/system/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
}

export function getStreamingServices() {
  return fetchJSON<Record<string, StreamingServiceStatus>>(`${BASE}/streaming/services`);
}

export function authenticateStreaming(service: string, body?: { username?: string; password?: string }) {
  return fetchJSON<StreamingAuthResponse>(`${BASE}/streaming/${encodeURIComponent(service)}/auth`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function disconnectStreaming(service: string) {
  return fetchJSON<{ disconnected: boolean }>(`${BASE}/streaming/${encodeURIComponent(service)}/disconnect`, {
    method: 'POST',
  });
}

export function getStreamingServiceStatus(service: string) {
  return fetchJSON<StreamingServiceStatus>(`${BASE}/streaming/${encodeURIComponent(service)}/status`);
}

export function rescanArtwork() {
  return fetchJSON<{ status: string }>(`${BASE}/library/artwork/rescan`, { method: 'POST' });
}

export function mergeAlbumDuplicates() {
  return fetchJSON<{ merged: number }>(`${BASE}/library/albums/merge-duplicates`, { method: 'POST' });
}

export function triggerEnrich() {
  return fetchJSON<{ status: string }>(`${BASE}/system/enrich`, { method: 'POST' });
}

// --- Streaming ---

export function searchStreaming(service: string, q: string, limit = 50) {
  return fetchJSON<SearchResult>(`${BASE}/streaming/${encodeURIComponent(service)}/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function getStreamingAlbum(service: string, albumId: string) {
  return fetchJSON<Album>(`${BASE}/streaming/${encodeURIComponent(service)}/albums/${encodeURIComponent(albumId)}`);
}

export function getStreamingAlbumTracks(service: string, albumId: string) {
  return fetchJSON<Track[]>(`${BASE}/streaming/${encodeURIComponent(service)}/albums/${encodeURIComponent(albumId)}/tracks`);
}

export function getStreamingArtist(service: string, artistId: string) {
  return fetchJSON<Artist>(`${BASE}/streaming/${encodeURIComponent(service)}/artists/${encodeURIComponent(artistId)}`);
}

export function getStreamingArtistAlbums(service: string, artistId: string) {
  return fetchJSON<Album[]>(`${BASE}/streaming/${encodeURIComponent(service)}/artists/${encodeURIComponent(artistId)}/albums`);
}

export function getStreamingFeaturedSections(service: string) {
  return fetchJSON<FeaturedSection[]>(`${BASE}/streaming/${encodeURIComponent(service)}/featured/sections`);
}

export function getStreamingFeatured(service: string, section: string, limit = 20) {
  return fetchJSON<Album[]>(`${BASE}/streaming/${encodeURIComponent(service)}/featured/${encodeURIComponent(section)}?limit=${limit}`);
}

export function getStreamingPlaylists(service: string) {
  return fetchJSON<import('./types').StreamingPlaylist[]>(`${BASE}/streaming/${encodeURIComponent(service)}/playlists`);
}

// --- Unified Playlist Manager ---

export function getAllPlaylists() {
  return fetchJSON<import('./types').UnifiedPlaylistsResponse>(`${BASE}/playlists/all`);
}

export function importPlaylist(service: string, playlistId: string, name?: string) {
  return fetchJSON<import('./types').PlaylistImportResponse>(`${BASE}/playlists/import`, {
    method: 'POST',
    body: JSON.stringify({ service, playlist_id: playlistId, name: name || undefined }),
  });
}

export function matchTrack(title: string, artistName: string, services?: string[]) {
  return fetchJSON<Record<string, import('./types').Track>>(`${BASE}/playlists/match`, {
    method: 'POST',
    body: JSON.stringify({ title, artist_name: artistName, services: services ?? [] }),
  });
}

export function getStreamingPlaylistTracks(service: string, playlistId: string) {
  return fetchJSON<Track[]>(`${BASE}/streaming/${encodeURIComponent(service)}/playlists/${encodeURIComponent(playlistId)}/tracks`);
}

export function transferPlaylist(sourceService: string, sourceId: string, targetService: string, targetName?: string) {
  return fetchJSON<import('./types').PlaylistTransferResponse>(`${BASE}/playlists/transfer`, {
    method: 'POST',
    body: JSON.stringify({
      source_service: sourceService,
      source_playlist_id: sourceId,
      target_service: targetService,
      target_name: targetName || undefined,
    }),
  });
}

export function diffPlaylists(sourceService: string, sourceId: string, targetService: string, targetId: string) {
  return fetchJSON<import('./types').PlaylistDiffResponse>(`${BASE}/playlists/diff`, {
    method: 'POST',
    body: JSON.stringify({
      source_service: sourceService,
      source_playlist_id: sourceId,
      target_service: targetService,
      target_playlist_id: targetId,
    }),
  });
}

export function recoverPlaylist(playlistId: number) {
  return fetchJSON<import('./types').PlaylistRecoverResponse>(`${BASE}/playlists/${playlistId}/recover`, {
    method: 'POST',
  });
}

export function applyRecovery(playlistId: number, replacements: Array<{ track_id: number; new_source: string; new_source_id: string }>) {
  return fetchJSON<import('./types').RecoverApplyResponse>(`${BASE}/playlists/${playlistId}/recover/apply`, {
    method: 'POST',
    body: JSON.stringify({ replacements }),
  });
}

// --- Playlist Manager v2 ---

export function getPlaylistManagerServices() {
  return fetchJSON<Record<string, { authenticated: boolean; supports_write: boolean }>>(`${BASE}/playlist-manager/services`);
}

export function transferPlaylistV2(body: {
  source_service: string; source_playlist_id: string; target_service: string;
  target_name?: string; create_on_target?: boolean; match_threshold?: number;
  include_approximate?: boolean; dry_run?: boolean;
}) {
  return fetchJSON<any>(`${BASE}/playlist-manager/transfer`, { method: 'POST', body: JSON.stringify(body) });
}

export function batchTransfer(body: {
  source_service: string; target_service: string; playlist_ids?: string[] | null; match_threshold?: number;
}) {
  return fetchJSON<any>(`${BASE}/playlist-manager/batch-transfer`, { method: 'POST', body: JSON.stringify(body) });
}

export function mergePlaylists(body: {
  playlists: Array<{ service: string; playlist_id: string }>; target_name: string;
  deduplicate?: boolean; target_service?: string;
}) {
  return fetchJSON<any>(`${BASE}/playlist-manager/merge`, { method: 'POST', body: JSON.stringify(body) });
}

export function backupPlaylists(services?: string[]) {
  return fetchJSON<any>(`${BASE}/playlist-manager/backup`, {
    method: 'POST', body: JSON.stringify({ services, include_tracks: true }),
  });
}

export function exportPlaylistFile(service: string, playlistId: string, format: string) {
  return fetch(`${BASE}/playlist-manager/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, playlist_id: playlistId, format }),
  });
}

export async function importPlaylistFile(file: File, format: string) {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch(`${BASE}/playlist-manager/import?format=${format}`, { method: 'POST', body: form });
  return resp.json();
}

export function getPlaylistLinks() {
  return fetchJSON<any[]>(`${BASE}/playlist-manager/links`);
}

export function createPlaylistLink(body: {
  local_playlist_id: number; service: string; service_playlist_id: string;
  sync_direction?: string; sync_interval_minutes?: number;
}) {
  return fetchJSON<any>(`${BASE}/playlist-manager/links`, { method: 'POST', body: JSON.stringify(body) });
}

export function triggerPlaylistSync(linkId: number) {
  return fetchJSON<any>(`${BASE}/playlist-manager/links/${linkId}/sync`, { method: 'POST' });
}

export function deletePlaylistLink(linkId: number) {
  return fetchJSON<any>(`${BASE}/playlist-manager/links/${linkId}`, { method: 'DELETE' });
}

export function getTransferHistory(limit = 50, offset = 0) {
  return fetchJSON<any[]>(`${BASE}/playlist-manager/history?limit=${limit}&offset=${offset}`);
}

export function getTransferDetail(transferId: number) {
  return fetchJSON<any>(`${BASE}/playlist-manager/history/${transferId}`);
}

// --- Radios ---

export function getRadios(params?: { genre?: string; favorite?: boolean; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.genre) q.set('genre', params.genre);
  if (params?.favorite !== undefined) q.set('favorite', String(params.favorite));
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  return fetchJSON<import('./types').RadioStation[]>(`${BASE}/radios${qs ? '?' + qs : ''}`);
}

export function getRadio(id: number) {
  return fetchJSON<import('./types').RadioStation>(`${BASE}/radios/${id}`);
}

export function createRadio(data: { name: string; stream_url: string; logo_url?: string; genre?: string; codec?: string; country?: string; homepage_url?: string; favorite?: boolean }) {
  return fetchJSON<import('./types').RadioStation>(`${BASE}/radios`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateRadio(id: number, data: Partial<{ name: string; stream_url: string; logo_url: string; genre: string; codec: string; country: string; homepage_url: string; favorite: boolean }>) {
  return fetchJSON<import('./types').RadioStation>(`${BASE}/radios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteRadio(id: number) {
  return fetchVoid(`${BASE}/radios/${id}`, { method: 'DELETE' });
}

export function playRadio(radioId: number, zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/radios/${radioId}/play/${zoneId}`, { method: 'POST' });
}

export async function uploadRadioCover(radioId: number, file: File): Promise<import('./types').RadioStation> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE}/radios/${radioId}/artwork`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

export async function importRadios(file: File): Promise<import('./types').RadioImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE}/radios/import`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

export function exportRadiosUrl(): string {
  return `${BASE}/radios/export.m3u`;
}


// --- Profiles ---

export function getProfiles() {
  return fetchJSON<any[]>(`${BASE}/profiles`);
}

export function createProfile(data: { name: string; avatar_color: string }) {
  return fetchJSON<any>(`${BASE}/profiles`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getProfile(id: number) {
  return fetchJSON<any>(`${BASE}/profiles/${id}`);
}

export function updateProfile(id: number, data: { name?: string; avatar_color?: string }) {
  return fetchJSON<any>(`${BASE}/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteProfile(id: number) {
  return fetchVoid(`${BASE}/profiles/${id}`, { method: 'DELETE' });
}

// --- Favorites ---

export function getFavorites(profileId: number, type?: 'track' | 'album' | 'artist') {
  const q = type ? `?type=${type}` : '';
  return fetchJSON<{ tracks: import('./types').Track[]; albums: import('./types').Album[]; artists: import('./types').Artist[] }>(`${BASE}/profiles/${profileId}/favorites${q}`);
}

export function addFavorite(profileId: number, body: { track_id?: number; album_id?: number; artist_id?: number }) {
  return fetchJSON<any>(`${BASE}/profiles/${profileId}/favorites`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeFavorite(profileId: number, params: { track_id?: number; album_id?: number; artist_id?: number }) {
  const q = new URLSearchParams();
  if (params.track_id !== undefined) q.set('track_id', String(params.track_id));
  if (params.album_id !== undefined) q.set('album_id', String(params.album_id));
  if (params.artist_id !== undefined) q.set('artist_id', String(params.artist_id));
  return fetchVoid(`${BASE}/profiles/${profileId}/favorites?${q.toString()}`, { method: 'DELETE' });
}

export function checkFavorite(profileId: number, params: { track_id?: number; album_id?: number; artist_id?: number }) {
  const q = new URLSearchParams();
  if (params.track_id !== undefined) q.set('track_id', String(params.track_id));
  if (params.album_id !== undefined) q.set('album_id', String(params.album_id));
  if (params.artist_id !== undefined) q.set('artist_id', String(params.artist_id));
  return fetchJSON<{ is_favorite: boolean }>(`${BASE}/profiles/${profileId}/favorites/check?${q.toString()}`);
}

// --- Artwork ---

export function artworkUrl(coverPath: string | null | undefined, size?: number): string {
  if (!coverPath) return '';
  // External URLs (http/https) pass through directly
  if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return coverPath;
  }
  // Extract filename from absolute path (e.g. /data/artwork_cache/abc123.jpg -> abc123.jpg)
  const filename = coverPath.split('/').pop() ?? coverPath;
  const sizeParam = size ? `?size=${size}` : '';
  return `${BASE}/library/artwork/${encodeURIComponent(filename)}${sizeParam}`;
}

// --- Album cover cache ---

const albumCoverCache = new Map<number, string | null>();
const albumCoverPending = new Map<number, Promise<string | null>>();

export async function getAlbumCoverPath(albumId: number): Promise<string | null> {
  if (albumCoverCache.has(albumId)) {
    return albumCoverCache.get(albumId)!;
  }
  if (albumCoverPending.has(albumId)) {
    return albumCoverPending.get(albumId)!;
  }
  const promise = getAlbum(albumId)
    .then((album) => {
      const cover = album.cover_path ?? null;
      albumCoverCache.set(albumId, cover);
      albumCoverPending.delete(albumId);
      return cover;
    })
    .catch(() => {
      albumCoverPending.delete(albumId);
      return null;
    });
  albumCoverPending.set(albumId, promise);
  return promise;
}

// --- Update ---

export async function checkForUpdate(): Promise<any> {
  const res = await fetch(`${BASE}/system/update/check`);
  return res.json();
}

export async function installUpdate(): Promise<any> {
  const res = await fetch(`${BASE}/system/update/install`, { method: 'POST' });
  return res.json();
}

// --- Podcasts ---

export async function searchPodcasts(query: string, limit = 20): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return res.json();
}

export async function getRadioFrancePodcasts(): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/radiofrance`);
  return res.json();
}

export async function getPodcastEpisodes(feedUrl: string, limit = 30, showUrl?: string): Promise<any[]> {
  let url = `${BASE}/podcasts/episodes?limit=${limit}`;
  if (feedUrl) url += `&feed_url=${encodeURIComponent(feedUrl)}`;
  if (showUrl) url += `&show_url=${encodeURIComponent(showUrl)}`;
  const res = await fetch(url);
  return res.json();
}
