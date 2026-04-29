// REST API client for tune-server

import { notifications } from './stores/notifications';

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
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    notifications.error('Network error: server unreachable');
    throw e;
  }
  if (!response.ok) {
    const err = await apiError(response);
    if (response.status >= 500) {
      notifications.error(`Server error: ${err.message}`);
    }
    throw err;
  }
  return response.json();
}

async function fetchVoid(url: string, options?: RequestInit): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (e) {
    notifications.error('Network error: server unreachable');
    throw e;
  }
  if (!response.ok) {
    const err = await apiError(response);
    if (response.status >= 500) {
      notifications.error(`Server error: ${err.message}`);
    }
    throw err;
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

export function clearDevices() {
  return fetchJSON<{ cleared: number }>(`${BASE}/devices/clear`, { method: 'POST' });
}

export function deleteDevice(deviceId: string) {
  return fetchJSON<{ deleted: string }>(`${BASE}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
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

// --- Zone Manager ---

export function getZoneOverview() {
  return fetchJSON<any>(`${BASE}/zone-manager/overview`);
}

export function hotSwapDevice(zoneId: number, outputType: string, outputDeviceId?: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/zones/${zoneId}/hot-swap`, {
    method: 'POST',
    body: JSON.stringify({ output_type: outputType, output_device_id: outputDeviceId }),
  });
}

export function muteZone(zoneId: number, muted: boolean) {
  return fetchJSON<any>(`${BASE}/zone-manager/zones/${zoneId}/mute`, {
    method: 'POST',
    body: JSON.stringify({ muted }),
  });
}

export function getZoneManagerGroups() {
  return fetchJSON<any[]>(`${BASE}/zone-manager/groups`);
}

export function createGroup(leaderZoneId: number, zoneIds: number[], name?: string, masterVolume = 0.5) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups`, {
    method: 'POST',
    body: JSON.stringify({ leader_zone_id: leaderZoneId, zone_ids: zoneIds, name, master_volume: masterVolume }),
  });
}

export function renameGroup(groupId: string, name: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteGroup(groupId: string) {
  return fetchVoid(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export function setGroupVolume(groupId: string, masterVolume?: number, offsets?: Record<number, number>) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}/volume`, {
    method: 'POST',
    body: JSON.stringify({ master_volume: masterVolume, offsets }),
  });
}

export function getZoneProfiles() {
  return fetchJSON<any[]>(`${BASE}/zone-manager/profiles`);
}

export function createZoneProfile(name: string, description?: string, icon?: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/profiles`, {
    method: 'POST',
    body: JSON.stringify({ name, description, icon }),
  });
}

export function activateZoneProfile(profileId: number) {
  return fetchJSON<any>(`${BASE}/zone-manager/profiles/${profileId}/activate`, { method: 'POST' });
}

export function deleteZoneProfile(profileId: number) {
  return fetchVoid(`${BASE}/zone-manager/profiles/${profileId}`, { method: 'DELETE' });
}

export function measureLatency(zoneId: number) {
  return fetchJSON<any>(`${BASE}/zone-manager/zones/${zoneId}/measure-latency`, { method: 'POST' });
}

export function calibrateGroup(groupId: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}/calibrate`, { method: 'POST' });
}

export function getZoneHealth(zoneId: number) {
  return fetchJSON<any>(`${BASE}/zone-manager/zones/${zoneId}/health`);
}

export function getGroupHealth(groupId: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}/health`);
}

export function getSyncStats() {
  return fetchJSON<any>(`${BASE}/zone-manager/sync/stats`);
}

export function getGaplessStatus(groupId: string) {
  return fetchJSON<any>(`${BASE}/zone-manager/groups/${encodeURIComponent(groupId)}/gapless`);
}

// --- Stereo Pairs ---

export function createStereoPair(name: string, leftDeviceId: string, rightDeviceId: string) {
  return fetchJSON<import('./types').StereoPairResponse>(`${BASE}/zones/stereo-pair`, {
    method: 'POST',
    body: JSON.stringify({ name, left_device_id: leftDeviceId, right_device_id: rightDeviceId }),
  });
}

export function dissolveStereoPair(pairId: string) {
  return fetchVoid(`${BASE}/zones/stereo-pair/${encodeURIComponent(pairId)}`, { method: 'DELETE' });
}

export function listStereoPairs() {
  return fetchJSON<import('./types').StereoPairInfo[]>(`${BASE}/zones/stereo-pairs/list`);
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

export function getTrackCredits(trackId: number) {
  return fetchJSON<import('./types').TrackCredit[]>(`${BASE}/library/tracks/${trackId}/credits`);
}

export function enrichTrackCredits(trackId: number) {
  return fetchJSON(`${BASE}/library/tracks/${trackId}/credits/enrich`, { method: 'POST' });
}

// v0.8.0 multi-room — Snapcast control plane.
export function getSnapcastStatus() {
  return fetchJSON<{enabled: boolean; reason?: string; binary?: string; stream_count?: number}>(
    `${BASE}/snapcast/status`
  );
}
export function listSnapcastClients() {
  return fetchJSON<import('./types').SnapcastClient[]>(`${BASE}/snapcast/clients`);
}
export function assignSnapcastClient(clientId: string, zoneId: number) {
  return fetchJSON(`${BASE}/snapcast/clients/${encodeURIComponent(clientId)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone_id: zoneId }),
  });
}
export function unassignSnapcastClient(clientId: string, zoneId: number) {
  return fetch(`${BASE}/snapcast/clients/${encodeURIComponent(clientId)}/assign`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone_id: zoneId }),
  }).then(r => r.json());
}

// v0.8.0 multi-room — Sonos / SoCo control plane.
export function listSonosSpeakers() {
  return fetchJSON<import('./types').SonosSpeaker[]>(`${BASE}/sonos/speakers`);
}
export function discoverSonos() {
  return fetchJSON<import('./types').SonosSpeaker[]>(`${BASE}/sonos/discover`, { method: 'POST' });
}
export function setSonosGroup(coordinatorUid: string, memberUids: string[]) {
  return fetchJSON(`${BASE}/sonos/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinator_uid: coordinatorUid, member_uids: memberUids }),
  });
}
export function unjoinSonosSpeaker(uid: string) {
  return fetchJSON(`${BASE}/sonos/speakers/${encodeURIComponent(uid)}/unjoin`, { method: 'POST' });
}

// v0.8.0 multi-room — group delays (calibrated inter-techno offsets).
export function listGroupDelays() {
  return fetchJSON<import('./types').GroupDelay[]>(`${BASE}/zones/group-delays`);
}
export function setGroupDelay(techA: string, techB: string, delayMs: number) {
  return fetchJSON(`${BASE}/zones/group-delays`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tech_a: techA, tech_b: techB, delay_ms: delayMs }),
  });
}

export type DashboardPeriod = 'today' | '7d' | '30d' | 'all';

export interface DashboardData {
  period: DashboardPeriod;
  range: { from: string | null; to: string };
  totals: { plays: number; listening_ms: number; unique_tracks: number; unique_artists: number };
  top_artists: { artist_name: string; plays: number; listening_ms: number }[];
  top_albums: { album_title: string; artist_name: string; cover_path: string | null; plays: number }[];
  top_tracks: { track_id: number | null; title: string; artist_name: string; plays: number; listening_ms: number }[];
  trend: { day: string; plays: number; listening_ms: number }[];
  hourly: { hour: number; plays: number }[];
  by_zone: { zone_id: number | null; zone_name: string | null; plays: number; listening_ms: number }[];
  by_source: { source: string | null; plays: number; listening_ms: number }[];
  completion: { completed: number; skipped: number; avg_listened_ms: number; avg_track_duration_ms: number };
}

export function getDashboard(period: DashboardPeriod = '30d', opts?: { zoneId?: number; profileId?: number; topN?: number }) {
  const params = new URLSearchParams({ period });
  if (opts?.zoneId !== undefined) params.set('zone_id', String(opts.zoneId));
  if (opts?.profileId !== undefined) params.set('profile_id', String(opts.profileId));
  if (opts?.topN !== undefined) params.set('top_n', String(opts.topN));
  return fetchJSON<DashboardData>(`${BASE}/library/history/dashboard?${params}`);
}

export function getArtistCredits(artistId: number) {
  return fetchJSON<import('./types').TrackCredit[]>(`${BASE}/library/artists/${artistId}/credits`);
}

export function getArtistMetadata(artistId: number) {
  return fetchJSON<import('./types').ArtistMetadata>(`${BASE}/artists/${artistId}/metadata`);
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

export function getPlaybackHistory(limit = 50) {
  return fetchJSON<import('./types').HistoryEntry[]>(`${BASE}/library/history?limit=${limit}`);
}

export function getTopTracks(limit = 20) {
  return fetchJSON<import('./types').TopTrack[]>(`${BASE}/library/history/top-tracks?limit=${limit}`);
}

export function getTopArtists(limit = 20) {
  return fetchJSON<import('./types').TopArtist[]>(`${BASE}/library/history/top-artists?limit=${limit}`);
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

export interface DoubtfulAlbum {
  id: number;
  title: string;
  artist_name: string | null;
  artist_resolved: string | null;
  genre: string | null;
  year: number | null;
  cover_path: string | null;
  source: string | null;
  reasons: string[];
}

export function getDoubtfulAlbums() {
  return fetchJSON<DoubtfulAlbum[]>(`${BASE}/metadata/doubtful`);
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

// --- Smart Playlists ---

export function getAlbumBio(albumId: number) {
  return fetchJSON<{ bio: string | null; source: string | null; release_id?: string | null }>(`${BASE}/library/albums/${albumId}/bio`);
}

export function getArtistTimeline(artistId: number) {
  return fetchJSON<any[]>(`${BASE}/library/artists/${artistId}/timeline`);
}

export function getSimilarAlbums(albumId: number, limit = 10) {
  return fetchJSON<import('./types').Album[]>(`${BASE}/library/albums/${albumId}/similar?limit=${limit}`);
}

export function setEqualizer(zoneId: number, preset: string) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/eq`, {
    method: 'POST',
    body: JSON.stringify({ preset }),
  });
}

export function shareNowPlaying(zoneId: number) {
  return fetchJSON<{ title: string; artist: string; album: string; text: string; cover_url: string | null }>(`${BASE}/zones/${zoneId}/share`);
}

export function transferPlayback(fromZoneId: number, toZoneId: number) {
  return fetchJSON<import('./types').Zone>(`${BASE}/zones/${fromZoneId}/transfer/${toZoneId}`, { method: 'POST' });
}

export function getTrackLyrics(trackId: number) {
  return fetchJSON<{ lyrics: string | null; synced: string | null; source: string | null }>(`${BASE}/library/tracks/${trackId}/lyrics`);
}

export function getSmartPlaylists() {
  return fetchJSON<any[]>(`${BASE}/library/smart-playlists`);
}

export function createSmartPlaylist(data: { name: string; rules: any[]; match_mode?: string; sort_by?: string; sort_order?: string; max_tracks?: number; description?: string }) {
  return fetchJSON<{ id: number }>(`${BASE}/library/smart-playlists`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getSmartPlaylist(id: number) {
  return fetchJSON<any>(`${BASE}/library/smart-playlists/${id}`);
}

export function updateSmartPlaylist(id: number, data: any) {
  return fetchJSON<any>(`${BASE}/library/smart-playlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteSmartPlaylist(id: number) {
  return fetchJSON<{ deleted: number }>(`${BASE}/library/smart-playlists/${id}`, { method: 'DELETE' });
}

export function getSmartPlaylistTracks(id: number) {
  return fetchJSON<import('./types').Track[]>(`${BASE}/library/smart-playlists/${id}/tracks`);
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
  return fetchJSON(`${BASE}/playlists/${playlistId}/tracks`, {
    method: 'PUT',
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

export function getDatabaseStatus() {
  return fetchJSON<any>(`${BASE}/system/database/status`);
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

export function restartServer() {
  return fetchJSON<{ status: string; message: string }>(`${BASE}/system/restart`, { method: 'POST' });
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

export function exportDatabaseUrl(): string {
  return `${BASE}/system/database/export`;
}

export async function importDatabase(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/system/database/import`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<{ imported: boolean; engine: string; size: number; restart_required: boolean }>;
}

export function getStreamingServices() {
  return fetchJSON<Record<string, StreamingServiceStatus>>(`${BASE}/streaming/services`);
}

export function enableStreamingService(service: string) {
  return fetchJSON<{ status: string }>(`${BASE}/streaming/${encodeURIComponent(service)}/enable`, { method: 'POST' });
}

export function disableStreamingService(service: string) {
  return fetchJSON<{ status: string }>(`${BASE}/streaming/${encodeURIComponent(service)}/disable`, { method: 'POST' });
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

// ───────────────────────── Spotify Connect (receiver) ─────────────────────────

export interface SpotifyConnectStatus {
  enabled: boolean;
  available: boolean;
  device_name: string | null;
  zone_id: number | null;
  binary_available: boolean;
  stream_url: string | null;
  active: boolean;
  reason?: string;
}

export async function downloadDiagnosticsBundle(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE}/system/diagnostics/bundle`);
  if (!res.ok) throw new Error(`Diagnostics bundle failed (${res.status})`);
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m ? m[1] : `tune-diagnostics-${Date.now()}.zip`;
  const blob = await res.blob();
  return { blob, filename };
}

export function getSpotifyConnectStatus() {
  return fetchJSON<SpotifyConnectStatus>(`${BASE}/spotify-connect/status`);
}

export function enableSpotifyConnect(zone_id: number, device_name?: string | null) {
  return fetchJSON<SpotifyConnectStatus>(`${BASE}/spotify-connect/enable`, {
    method: 'POST',
    body: JSON.stringify({ zone_id, device_name: device_name ?? null }),
  });
}

export function disableSpotifyConnect() {
  return fetchJSON<SpotifyConnectStatus>(`${BASE}/spotify-connect/disable`, { method: 'POST' });
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
  // cache-bust: auth state can flip during a session (login/logout/token
  // refresh) and FastAPI doesn't set Cache-Control on this endpoint, so
  // browsers happily reuse the previous response. Force a fresh fetch.
  return fetchJSON<Record<string, { authenticated: boolean; supports_write: boolean }>>(
    `${BASE}/playlist-manager/services?_=${Date.now()}`,
    { cache: 'no-store' },
  );
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

export interface PlaylistSnapshot {
  id: number;
  source_service: string;
  source_playlist_id: string;
  playlist_name: string;
  track_count: number;
  created_at?: string | null;
}

export interface SnapshotDetail extends PlaylistSnapshot {
  tracks: Array<{ title?: string; artist_name?: string; album_title?: string; duration_ms?: number; source_id?: string; isrc?: string }>;
}

export function listPlaylistSnapshots(service?: string) {
  const url = service
    ? `${BASE}/playlist-manager/backups?service=${encodeURIComponent(service)}`
    : `${BASE}/playlist-manager/backups`;
  return fetchJSON<PlaylistSnapshot[]>(url);
}

export function getPlaylistSnapshot(id: number) {
  return fetchJSON<SnapshotDetail>(`${BASE}/playlist-manager/backups/${id}`);
}

export function deletePlaylistSnapshot(id: number) {
  return fetchJSON<{ deleted: boolean; id: number }>(`${BASE}/playlist-manager/backups/${id}`, { method: 'DELETE' });
}

export function restorePlaylistSnapshot(id: number, body?: { target_name?: string; overwrite_existing?: boolean }) {
  return fetchJSON<{ local_playlist_id: number; name: string; tracks_restored: number; tracks_matched: number; tracks_not_found: number }>(
    `${BASE}/playlist-manager/backups/${id}/restore`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  );
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

// --- Metadata Manager ---

export function updateTrackMetadata(trackId: number, updates: Record<string, any>) {
  return fetchJSON(`${BASE}/metadata/tracks/${trackId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function updateAlbumMetadata(albumId: number, updates: Record<string, any>) {
  return fetchJSON(`${BASE}/metadata/albums/${albumId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function writeTrackTags(trackId: number) {
  return fetchJSON(`${BASE}/metadata/tracks/${trackId}/write-tags`, { method: 'POST' });
}

export function writeAlbumTags(albumId: number) {
  return fetchJSON(`${BASE}/metadata/albums/${albumId}/write-tags`, { method: 'POST' });
}

export function mergeAlbums(albumIds: number[]) {
  return fetchJSON(`${BASE}/metadata/albums/merge`, {
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

export function startAutoFix() {
  return fetchJSON(`${BASE}/metadata/auto-fix`, { method: 'POST' });
}

export function getAutoFixStatus() {
  return fetchJSON(`${BASE}/metadata/auto-fix/status`);
}

export function getAutoFixReport(limit = 10) {
  return fetchJSON(`${BASE}/metadata/auto-fix/report?limit=${limit}`);
}

export function scanDuplicates() {
  return fetchJSON(`${BASE}/metadata/duplicates/scan?limit=0`, { method: 'POST' });
}

export function listDuplicates() {
  return fetchJSON(`${BASE}/metadata/duplicates`);
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

export function autoFixAlbums() {
  return fetchJSON(`${BASE}/metadata/auto-fix-albums`, { method: 'POST' });
}

export function fixYearsMusicBrainz() {
  return fetchJSON(`${BASE}/metadata/fix-years-musicbrainz`, { method: 'POST' });
}

export function fixYearsDiscogs() {
  return fetchJSON(`${BASE}/metadata/fix-years-discogs`, { method: 'POST' });
}

export function fixYearsTidal() {
  return fetchJSON(`${BASE}/metadata/fix-years-tidal`, { method: 'POST' });
}

export function fixYearsTags() {
  return fetchJSON(`${BASE}/metadata/fix-years-tags`, { method: 'POST' });
}

export function fixGenres() {
  return fetchJSON(`${BASE}/metadata/fix-genres`, { method: 'POST' });
}

export function clearLibrary() {
  return fetchJSON(`${BASE}/system/library/clear`, { method: 'POST' });
}

export function writeAllTags() {
  return fetchJSON(`${BASE}/metadata/write-all-tags`, { method: 'POST' });
}

export function writeAllCovers() {
  return fetchJSON(`${BASE}/metadata/write-all-covers`, { method: 'POST' });
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

// --- Network / SMB ---

export function discoverSmbShares() {
  return fetchJSON<any[]>(`${BASE}/network/shares`);
}

export function scanHost(host: string, protocol?: string) {
  let url = `${BASE}/network/scan-host?host=${encodeURIComponent(host)}`;
  if (protocol) url += `&protocol=${encodeURIComponent(protocol)}`;
  return fetchJSON<any>(url);
}

export function listHostShares(hostId: string) {
  return fetchJSON<{ shares: string[] }>(`${BASE}/network/shares/${encodeURIComponent(hostId)}`);
}

export function testSmbConnection(host: string, share: string, username?: string, password?: string, domain?: string) {
  return fetchJSON<{ ok: boolean; message?: string; error?: string }>(`${BASE}/network/mounts/test`, {
    method: 'POST',
    body: JSON.stringify({ host, share, username, password, domain }),
  });
}

export function mountSmbShare(host: string, share: string, username?: string, password?: string) {
  return fetchJSON<{ mount_path: string; id: number }>(`${BASE}/network/mounts`, {
    method: 'POST',
    body: JSON.stringify({ host, share, username, password }),
  });
}

export function unmountSmbShare(id: number) {
  return fetchVoid(`${BASE}/network/mounts/${id}`, { method: 'DELETE' });
}

export function listMounts() {
  return fetchJSON<any[]>(`${BASE}/network/mounts`);
}

// --- DJ Mode ---

export function enableDJ(zoneId: number) {
  return fetchJSON<any>(`${BASE}/dj/enable/${zoneId}`, { method: 'POST' });
}

export function disableDJ(zoneId: number) {
  return fetchJSON<any>(`${BASE}/dj/disable/${zoneId}`, { method: 'POST' });
}

export function loadDeck(zoneId: number, deck: 'a' | 'b', body: { track_id?: number; album_id?: number }) {
  return fetchJSON<any>(`${BASE}/dj/load/${zoneId}/${deck}`, { method: 'POST', body: JSON.stringify(body) });
}

export function startCrossfade(zoneId: number, durationSeconds = 5, curve = 'linear') {
  return fetchJSON<any>(`${BASE}/dj/crossfade/${zoneId}`, { method: 'POST', body: JSON.stringify({ duration_seconds: durationSeconds, curve }) });
}

export function toggleAutoCrossfade(zoneId: number, enabled?: boolean, beforeEnd?: number) {
  return fetchJSON<any>(`${BASE}/dj/auto-crossfade/${zoneId}`, { method: 'POST', body: JSON.stringify({ enabled, before_end: beforeEnd }) });
}

export function getDJStatus(zoneId: number) {
  return fetchJSON<any>(`${BASE}/dj/status/${zoneId}`);
}

export function playDeck(zoneId: number, deck: 'a' | 'b') {
  return fetchJSON<any>(`${BASE}/dj/play/${zoneId}/${deck}`, { method: 'POST' });
}

export function pauseDeck(zoneId: number, deck: 'a' | 'b') {
  return fetchJSON<any>(`${BASE}/dj/pause/${zoneId}/${deck}`, { method: 'POST' });
}

export function setCrossfader(zoneId: number, position: number) {
  return fetchJSON<any>(`${BASE}/dj/crossfader/${zoneId}`, { method: 'POST', body: JSON.stringify({ position }) });
}

export function getWaveform(trackId: number) {
  return fetchJSON<{ track_id: number; waveform: number[]; bpm: number | null }>(`${BASE}/dj/waveform/${trackId}`);
}

export function analyzeTrack(trackId: number) {
  return fetchJSON<any>(`${BASE}/dj/analyze/${trackId}`, { method: 'POST' });
}

export function syncTempo(zoneId: number) {
  return fetchJSON<any>(`${BASE}/dj/sync-tempo/${zoneId}`, { method: 'POST' });
}

export function setDeckVolume(zoneId: number, deck: 'a' | 'b', volume: number) {
  return fetchJSON<any>(`${BASE}/dj/volume/${zoneId}/${deck}`, { method: 'POST', body: JSON.stringify({ volume }) });
}

// --- Party Mode ---

export function getPartyStatus() {
  return fetchJSON<any>(`${BASE}/party/status`);
}

export function partyAddTrack(query: string, zoneId?: number) {
  return fetchJSON<any>(`${BASE}/party/add`, { method: 'POST', body: JSON.stringify({ query, zone_id: zoneId }) });
}

export function partyVote(position: number, zoneId?: number) {
  return fetchJSON<any>(`${BASE}/party/vote`, { method: 'POST', body: JSON.stringify({ position, zone_id: zoneId }) });
}

export function partyResetVotes(zoneId?: number) {
  const qs = zoneId ? `?zone_id=${zoneId}` : '';
  return fetchJSON<any>(`${BASE}/party/vote/reset${qs}`, { method: 'POST' });
}

export function getPartyQueue(zoneId?: number) {
  const qs = zoneId ? `?zone_id=${zoneId}` : '';
  return fetchJSON<any[]>(`${BASE}/party/queue${qs}`);
}

// --- Radio Favorites → Playlist ---

export function createPlaylistFromRadioFavorites(service: string, playlistName: string, limit = 200) {
  return fetchJSON<any>(`${BASE}/radio-favorites/create-playlist`, {
    method: 'POST',
    body: JSON.stringify({ service, playlist_name: playlistName, limit }),
  });
}

// --- Sleep Timer ---

export function setSleepTimer(zoneId: number, minutes: number) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/sleep`, { method: 'POST', body: JSON.stringify({ minutes }) });
}

export function getSleepTimer(zoneId: number) {
  return fetchJSON<{ active: boolean }>(`${BASE}/zones/${zoneId}/sleep`);
}

// --- Queue → Playlist ---

export function saveQueueAsPlaylist(zoneId: number, name?: string) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/queue/save-as-playlist`, { method: 'POST', body: JSON.stringify({ name }) });
}

// --- Crossfade ---

export function setCrossfade(zoneId: number, enabled: boolean, duration = 3.0) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/crossfade`, { method: 'POST', body: JSON.stringify({ enabled, duration }) });
}

// --- Volume Normalization ---

export function setNormalization(zoneId: number, enabled: boolean, targetLufs = -14.0) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/normalization`, { method: 'POST', body: JSON.stringify({ enabled, target_lufs: targetLufs }) });
}

// --- DSP / Crossfeed ---

export function setDSP(zoneId: number, crossfeed: string | null) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/dsp`, { method: 'POST', body: JSON.stringify({ crossfeed }) });
}

// --- Recommendations ---

export function getRecommendations(limit = 20) {
  return fetchJSON<any>(`${BASE}/library/recommendations?limit=${limit}`);
}

// --- Listening Dashboard ---

export function getHistoryDashboard() {
  return fetchJSON<any>(`${BASE}/library/history/dashboard`);
}

// --- Album Ratings ---

export function rateAlbum(albumId: number, rating: number, note?: string) {
  return fetchJSON<any>(`${BASE}/library/albums/${albumId}/rate`, { method: 'POST', body: JSON.stringify({ rating, note }) });
}

export function getAlbumRating(albumId: number) {
  return fetchJSON<any>(`${BASE}/library/albums/${albumId}/rating`);
}

export function getTopRatedAlbums(limit = 20) {
  return fetchJSON<any[]>(`${BASE}/library/albums/top-rated?limit=${limit}`);
}

// --- Collaborative Playlists ---

export function getCollaborativePlaylists() {
  return fetchJSON<any[]>(`${BASE}/playlists/collaborative`);
}

export function createCollaborativePlaylist(name: string, description?: string) {
  return fetchJSON<any>(`${BASE}/playlists/collaborative`, { method: 'POST', body: JSON.stringify({ name, description }) });
}

export function addToCollaborativePlaylist(playlistId: number, trackId: number) {
  return fetchJSON<any>(`${BASE}/playlists/collaborative/${playlistId}/add`, { method: 'POST', body: JSON.stringify({ track_id: trackId }) });
}

export function getCollaborativePlaylistTracks(playlistId: number) {
  return fetchJSON<any[]>(`${BASE}/playlists/collaborative/${playlistId}/tracks`);
}

export function deleteCollaborativePlaylist(playlistId: number) {
  return fetchJSON<any>(`${BASE}/playlists/collaborative/${playlistId}`, { method: 'DELETE' });
}

// --- Alarm Clock ---
export function setAlarm(zoneId: number, time: string | null, opts?: { album_id?: number; playlist_id?: number; radio_id?: number; fade_seconds?: number }) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/alarm`, { method: 'POST', body: JSON.stringify({ time, ...opts }) });
}
export function getAlarm(zoneId: number) { return fetchJSON<any>(`${BASE}/zones/${zoneId}/alarm`); }
export function cancelAlarm(zoneId: number) { return fetchJSON<any>(`${BASE}/zones/${zoneId}/alarm`, { method: 'DELETE' }); }

// --- Quick Favorites ---
export function quickFavTrack(trackId: number) { return fetchJSON<any>(`${BASE}/library/tracks/${trackId}/quick-fav`, { method: 'POST' }); }
export function quickFavAlbum(albumId: number) { return fetchJSON<any>(`${BASE}/library/albums/${albumId}/quick-fav`, { method: 'POST' }); }

// --- Collections ---
export function getCollections() { return fetchJSON<any[]>(`${BASE}/library/collections`); }
export function createCollection(name: string, description?: string, icon?: string, color?: string) {
  return fetchJSON<any>(`${BASE}/library/collections`, { method: 'POST', body: JSON.stringify({ name, description, icon, color }) });
}
export function updateCollection(id: number, data: any) { return fetchJSON<any>(`${BASE}/library/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export function deleteCollection(id: number) { return fetchJSON<any>(`${BASE}/library/collections/${id}`, { method: 'DELETE' }); }
export function getCollectionAlbums(id: number) { return fetchJSON<any[]>(`${BASE}/library/collections/${id}/albums`); }
export function addAlbumToCollection(collectionId: number, albumId: number) {
  return fetchJSON<any>(`${BASE}/library/collections/${collectionId}/albums`, { method: 'POST', body: JSON.stringify({ album_id: albumId }) });
}
export function removeAlbumFromCollection(collectionId: number, albumId: number) {
  return fetchJSON<any>(`${BASE}/library/collections/${collectionId}/albums/${albumId}`, { method: 'DELETE' });
}

// --- Smart Duplicates ---
export function getSmartDuplicates(limit = 50) { return fetchJSON<any>(`${BASE}/library/duplicates/smart?limit=${limit}`); }

// --- Activity Feed ---
export function getActivityFeed(limit = 30) { return fetchJSON<any[]>(`${BASE}/library/activity?limit=${limit}`); }

// --- Share Playlist ---
export function sharePlaylist(playlistId: number) { return fetchJSON<any>(`${BASE}/playlists/${playlistId}/share`); }

// --- Now Listening ---
export function getNowListening() { return fetchJSON<any[]>(`${BASE}/zones/now-listening`); }

// --- Audio Profile ---
export function getAudioProfile(zoneId: number) { return fetchJSON<any>(`${BASE}/zones/${zoneId}/audio-profile`); }
export function setAudioProfile(zoneId: number, profile: any) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/audio-profile`, { method: 'POST', body: JSON.stringify(profile) });
}

// --- Ratings Export/Import ---
export function exportRatings() { return fetchJSON<any>(`${BASE}/library/ratings/export`); }
export function importRatings(ratings: any[]) { return fetchJSON<any>(`${BASE}/library/ratings/import`, { method: 'POST', body: JSON.stringify({ ratings }) }); }

// --- Podcasts ---

export async function searchPodcasts(query: string, limit = 20): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Search podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getRadioFrancePodcasts(): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/radiofrance`);
  if (!res.ok) throw new Error(`Radio France podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getPodcastEpisodes(feedUrl: string, limit = 30, showUrl?: string): Promise<any[]> {
  let url = `${BASE}/podcasts/episodes?limit=${limit}`;
  if (feedUrl) url += `&feed_url=${encodeURIComponent(feedUrl)}`;
  if (showUrl) url += `&show_url=${encodeURIComponent(showUrl)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Podcast episodes failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// v0.8.0 — Smart Collections
export function listSmartCollections() {
  return fetchJSON<import('./types').SmartCollection[]>(`${BASE}/library/smart-collections`);
}
export function getSmartCollection(id: number) {
  return fetchJSON<import('./types').SmartCollection>(`${BASE}/library/smart-collections/${id}`);
}
export function createSmartCollection(payload: Partial<import('./types').SmartCollection> & { rules: any[] }) {
  return fetchJSON<import('./types').SmartCollection>(`${BASE}/library/smart-collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
export function updateSmartCollection(id: number, payload: any) {
  return fetchJSON<import('./types').SmartCollection>(`${BASE}/library/smart-collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
export function deleteSmartCollection(id: number) {
  return fetch(`${BASE}/library/smart-collections/${id}`, { method: 'DELETE' }).then(r => r.json());
}
export function getSmartCollectionAlbums(id: number) {
  return fetchJSON<any[]>(`${BASE}/library/smart-collections/${id}/albums`);
}
export function previewSmartCollection(payload: { rules: any[]; match_mode?: string; sort_by?: string; sort_order?: string; max_albums?: number }) {
  return fetchJSON<import('./types').SmartCollectionPreview>(`${BASE}/library/smart-collections/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
