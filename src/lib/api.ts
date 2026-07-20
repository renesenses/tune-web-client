// REST API client for tune-server

import { notifications } from './stores/notifications';
import { getToken, clearToken } from './auth';
import { get } from 'svelte/store';
import { locale } from './i18n';

/** Current UI locale, sent as Accept-Language so server-provided strings
 *  (metadata labels, errors, …) match the app's chosen language. */
const acceptLang = (): string => {
  try {
    return get(locale);
  } catch {
    return 'fr';
  }
};

let _lastNetworkError = 0;
function showNetworkError() {
  const now = Date.now();
  if (now - _lastNetworkError < 30000) return;
  _lastNetworkError = now;
  notifications.error('Network error: server unreachable');
}

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

export const BASE = '/api/v1';

function stripDoubleBase(path: string): string {
  if (path.startsWith(BASE)) return path.slice(BASE.length);
  return path;
}

// Generic helpers for radio favorites and custom endpoints
export async function apiFetch(path: string): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, { headers });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw new Error(`${resp.status}`);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiPost(path: string, body?: any): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang() };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw new Error(`${resp.status}`);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiPatch(path: string, body?: any): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang() };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, {
    method: 'PATCH',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw new Error(`${resp.status}`);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiDelete(path: string): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, { method: 'DELETE', headers });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw new Error(`${resp.status}`);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

async function apiError(response: Response): Promise<Error> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body.detail) detail = body.detail;
  } catch { /* ignore */ }
  return new Error(detail);
}

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Accept-Language': acceptLang(),
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    response = await fetch(url, {
      headers,
      ...options,
    });
  } catch (e) {
    showNetworkError();
    throw e;
  }
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    if (response.status === 402) {
      try {
        const body = await response.json();
        notifications.error(body?.message || 'Tune Premium requis pour cette fonctionnalite');
      } catch {
        notifications.error('Tune Premium requis pour cette fonctionnalite');
      }
      throw new Error('premium_required');
    }
    const err = await apiError(response);
    if (response.status >= 500) {
      notifications.error(`Server error: ${err.message}`);
    }
    throw err;
  }
  const text = await response.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

/** Wrap a promise with a timeout — rejects with an Error after `ms` milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function fetchVoid(url: string, options?: RequestInit): Promise<void> {
  let response: Response;
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Accept-Language': acceptLang(),
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    response = await fetch(url, {
      headers,
      ...options,
    });
  } catch (e) {
    showNetworkError();
    throw e;
  }
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    const err = await apiError(response);
    if (response.status >= 500) {
      notifications.error(`Server error: ${err.message}`);
    }
    throw err;
  }
}

// --- Zones ---

export function getZones() {
  return fetchJSON<Zone[]>(`${BASE}/zones`).then(zs => zs.map(mapZoneQuality));
}

export function getZone(id: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`).then(mapZoneQuality);
}

export function getDefaultZone(): Promise<{ zone_id: number | null }> {
  return fetchJSON(`${BASE}/system/settings/default-zone`);
}

export function setDefaultZone(zoneId: number | null): Promise<{ zone_id: number | null }> {
  return fetchJSON(`${BASE}/system/settings/default-zone`, {
    method: 'PUT',
    body: JSON.stringify({ zone_id: zoneId }),
  });
}

export function createZone(name: string, outputType: OutputType = 'local', outputDeviceId?: string) {
  return fetchJSON<Zone>(`${BASE}/zones`, {
    method: 'POST',
    body: JSON.stringify({ name, output_type: outputType, output_device_id: outputDeviceId }),
  });
}

export function renameZone(id: number, name: string) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function updateZoneSyncDelay(id: number, syncDelayMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ sync_delay_ms: syncDelayMs }),
  });
}

export function updateZoneDsdMode(id: number, dsdMode: string) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dsd_mode: dsdMode }),
  });
}

export function updateZoneMaxSampleRate(id: number, rate: number | null) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ max_sample_rate: rate }),
  });
}

export function updateZoneDlnaNativeFlac(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_native_flac: enabled }),
  });
}

export function updateZoneAlacPassthrough(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ alac_passthrough: enabled }),
  });
}

export function changeZoneOutput(id: number, outputType: string, outputDeviceId?: string | null) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ output_type: outputType, output_device_id: outputDeviceId ?? null }),
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
  // Server returns 204 No Content, use fetchVoid to avoid JSON parse error on empty body
  return fetchVoid(`${BASE}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

export function getDevice(id: string) {
  return fetchJSON<DiscoveredDevice>(`${BASE}/devices/${encodeURIComponent(id)}`);
}

export async function getAudioDevices(): Promise<LocalAudioDevice[]> {
  const data = await fetchJSON<any>(`${BASE}/devices/audio`);
  return Array.isArray(data) ? data : (data?.devices ?? []);
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

// --- Zone Pins (OpenHome Presets) ---

export function getZonePins(zoneId: number) {
  return fetchJSON<{ supported: boolean; pins: any[]; max_slots: number }>(`${BASE}/zones/${zoneId}/pins`);
}

export function setZonePin(zoneId: number, data: { index: number; title: string; uri?: string; mode?: string; type?: string; description?: string; artwork_uri?: string; shuffle?: boolean }) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/pins`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function clearZonePin(zoneId: number, index: number) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/pins/${index}`, { method: 'DELETE' });
}

export function invokeZonePin(zoneId: number, index: number) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/pins/${index}/invoke`, { method: 'POST' });
}

export function saveQueueAsPin(zoneId: number, title: string, index?: number) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/pins/from-queue`, {
    method: 'POST',
    body: JSON.stringify({ title, index }),
  });
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

export function play(zoneId: number, body?: { track_id?: number; track_ids?: number[]; album_id?: number; playlist_id?: number; source?: Source; source_id?: string; streaming_album_id?: string; streaming_playlist_id?: string; start_index?: number; file_path?: string }) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/play`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  }).then(mapZoneQuality);
}

export function pause(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/pause`, { method: 'POST' }).then(mapZoneQuality);
}

export function resume(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/resume`, { method: 'POST' }).then(mapZoneQuality);
}

export function stop(zoneId: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/stop`, { method: 'POST' }).then(mapZoneQuality);
}

export function next(zoneId: number) {
  return fetchJSON<{ status: string; queue_position?: number }>(`${BASE}/zones/${zoneId}/next`, { method: 'POST' });
}

export function previous(zoneId: number) {
  return fetchJSON<{ status: string; queue_position?: number }>(`${BASE}/zones/${zoneId}/previous`, { method: 'POST' });
}

export function seek(zoneId: number, positionMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${zoneId}/seek`, {
    method: 'POST',
    body: JSON.stringify({ position_ms: positionMs }),
  });
}

export function setVolume(zoneId: number, volume: number) {
  return fetchVoid(`${BASE}/zones/${zoneId}/volume`, {
    method: 'PUT',
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

export function shuffleAll(
  zoneId: number,
  opts?: { search_query?: string; album_id?: number; artist_id?: number; genre?: string },
) {
  const params = new URLSearchParams({ zone_id: String(zoneId) });
  if (opts?.search_query) params.set('search_query', opts.search_query);
  if (opts?.album_id != null) params.set('album_id', String(opts.album_id));
  if (opts?.artist_id != null) params.set('artist_id', String(opts.artist_id));
  if (opts?.genre) params.set('genre', opts.genre);
  return fetchJSON<{ status: string; track_count: number }>(`${BASE}/playback/shuffle-all?${params}`, {
    method: 'POST',
  });
}

// --- Queue ---

export function getQueue(zoneId: number) {
  return fetchJSON<QueueStateResponse>(`${BASE}/zones/${zoneId}/queue`);
}

export function addToQueue(zoneId: number, body: { track_id?: number; track_ids?: number[]; album_id?: number; source?: Source | 'upload'; source_id?: string; file_path?: string; position?: number; title?: string; artist_name?: string; album_title?: string; cover_path?: string; duration_ms?: number }) {
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
  return fetchVoid(`${BASE}/zones/${zoneId}/queue/clear`, {
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

export async function getAllAlbums(pageSize = 2000, sort = 'title', order = 'asc', page?: number, perPage?: number): Promise<Album[]> {
  // When page is specified, fetch a single page (for future pagination support)
  if (page !== undefined) {
    const limit = perPage ?? 100;
    const offset = (page - 1) * limit;
    const raw = await fetchJSON<any>(`${BASE}/library/albums?limit=${limit}&offset=${offset}&sort=${sort}&order=${order}`);
    return Array.isArray(raw) ? raw : (raw.items ?? []);
  }
  // Default: fetch all albums in batches
  const all: Album[] = [];
  let offset = 0;
  while (true) {
    const raw = await fetchJSON<any>(`${BASE}/library/albums?limit=${pageSize}&offset=${offset}&sort=${sort}&order=${order}`);
    const batch: Album[] = Array.isArray(raw) ? raw : (raw.items ?? []);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function getAlbum(id: number) {
  return fetchJSON<Album>(`${BASE}/library/albums/${id}`);
}

export function getAlbumTracks(id: number, quality?: string | null, format?: string | null) {
  // Forward the active library quality/format filter so the album detail shows
  // only the matching tracks (Sergio: a Hi-Res/FLAC filter must not reveal the
  // album's MP3/44.1 tracks). No params → all tracks, as before.
  const p = new URLSearchParams();
  if (quality) p.set('quality', quality);
  if (format) p.set('format', format);
  const qs = p.toString();
  return fetchJSON<Track[]>(`${BASE}/library/albums/${id}/tracks${qs ? `?${qs}` : ''}`);
}

export async function getArtists(limit = 100, offset = 0) {
  const raw = await fetchJSON<any>(`${BASE}/library/artists?limit=${limit}&offset=${offset}`);
  return Array.isArray(raw) ? raw : (raw.items ?? []) as Artist[];
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

// v0.8.0 — Squeezebox / Lyrion Music Server (LMS) integration.
export interface SqueezeboxPlayer {
  id: string;
  name: string;
  model: string;
  ip: string;
  connected: boolean;
  power: boolean;
}

export interface SqueezeboxStatus {
  enabled: boolean;
  lms_host: string | null;
  lms_discovered: boolean;
  players: SqueezeboxPlayer[];
}

export function getSqueezeboxStatus() {
  return fetchJSON<SqueezeboxStatus>(`${BASE}/squeezebox/status`);
}

export function discoverSqueezebox() {
  return fetchJSON<SqueezeboxStatus>(`${BASE}/squeezebox/discover`, { method: 'POST' });
}

export function createZoneFromSqueezebox(playerId: string, name?: string) {
  return fetchJSON<import('./types').Zone>(`${BASE}/squeezebox/players/${encodeURIComponent(playerId)}/create-zone`, {
    method: 'POST',
    body: JSON.stringify({ name: name ?? undefined }),
  });
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
  top_albums: { album_title: string; artist_name: string; cover_path: string | null; plays: number; album_id?: number | null; source?: string | null; source_id?: string | null }[];
  top_tracks: { track_id: number | null; title: string; artist_name: string; plays: number; listening_ms: number; source?: string | null; source_id?: string | null }[];
  trend: { day: string; plays: number; listening_ms: number }[];
  hourly: { hour: number; plays: number }[];
  by_zone: { zone_id: number | null; zone_name: string | null; plays: number; listening_ms: number }[];
  by_source: { source: string | null; plays: number; listening_ms: number }[];
  by_genre?: { genre: string; plays: number; listening_ms: number }[];
  weekday_hourly?: { weekday: number; hour: number; plays: number }[];
  streak?: { current: number; best: number; last_day: string | null };
  on_this_day?: { track_title: string | null; artist_name: string | null; album_title: string | null; cover_path: string | null; played_at: string | null; year: number | null }[];
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
  // Under /library like every other artist route — the missing prefix 404'd
  // (api_not_found /artists/{id}/metadata, Jean Valjean #1096).
  return fetchJSON<import('./types').ArtistMetadata>(`${BASE}/library/artists/${artistId}/metadata`);
}

export function enrichArtist(artistId: number) {
  return fetchJSON<import('./types').ArtistMetadata>(`${BASE}/metadata/artists/${artistId}/enrich`);
}

export function getArtistTracks(id: number) {
  return fetchJSON<Track[]>(`${BASE}/library/artists/${id}/tracks`);
}

export function reportArtistImage(artistId: number) {
  // fetchJSON always sends Content-Type: application/json, but this call had no
  // body — axum's Json<ImageReportBody> extractor then fails to parse the empty
  // payload and the report errors out ("erreur lors du signalement", Jean
  // Valjean #1096). Send a JSON body (reason is optional server-side).
  return fetchJSON<{ status: string; artist_id: number }>(`${BASE}/library/artists/${artistId}/image/report`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'incorrect_image' }),
  });
}

export async function uploadArtistImage(artistId: number, file: File): Promise<Artist> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE}/library/artists/${artistId}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getTracks(limit = 100, offset = 0) {
  const raw = await fetchJSON<any>(`${BASE}/library/tracks?limit=${limit}&offset=${offset}`);
  return Array.isArray(raw) ? raw : (raw.items ?? []) as Track[];
}

export async function getFilteredTracks(opts: {
  genre?: string;
  format?: string;
  sample_rate?: number;
  bit_depth?: number;
  year?: number;
  source?: string;
  label?: string;
  composer?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Track[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.genre) params.set('genre', opts.genre);
  if (opts.format) params.set('format', opts.format);
  if (opts.sample_rate != null) params.set('sample_rate', String(opts.sample_rate));
  if (opts.bit_depth != null) params.set('bit_depth', String(opts.bit_depth));
  if (opts.year != null) params.set('year', String(opts.year));
  if (opts.source) params.set('source', opts.source);
  if (opts.label) params.set('label', opts.label);
  if (opts.composer) params.set('composer', opts.composer);
  if (opts.q) params.set('q', opts.q);
  params.set('limit', String(opts.limit ?? 200));
  if (opts.offset) params.set('offset', String(opts.offset));
  const raw = await fetchJSON<any>(`${BASE}/library/tracks?${params}`);
  const items: Track[] = Array.isArray(raw) ? raw : (raw.items ?? []);
  const total: number = Array.isArray(raw) ? raw.length : (raw.total ?? items.length);
  return { items, total };
}

export async function getAllTracks(pageSize = 2000): Promise<Track[]> {
  const all: Track[] = [];
  let offset = 0;
  while (true) {
    const raw = await fetchJSON<any>(`${BASE}/library/tracks?limit=${pageSize}&offset=${offset}`);
    const batch: Track[] = Array.isArray(raw) ? raw : (raw.items ?? []);
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
  return fetchJSON<{ items: any[]; total: number }>(`${BASE}/library/history?limit=${limit}`);
}

export function clearPlaybackHistory() {
  return apiDelete('/library/history');
}

export function getTopTracks(limit = 20) {
  return fetchJSON<import('./types').TopTrack[]>(`${BASE}/library/history/top-tracks?limit=${limit}`);
}

/// Non-radio play count for one local track (Progman, #1056).
export function getTrackPlays(trackId: number) {
  return fetchJSON<{ track_id: number; plays: number }>(`${BASE}/library/history/tracks/${trackId}/plays`);
}

export function getTopArtists(limit = 20) {
  return fetchJSON<import('./types').TopArtist[]>(`${BASE}/library/history/top-artists?limit=${limit}`);
}

export function getLibraryStats() {
  return fetchJSON<{ tracks: number; albums: number; artists: number }>(`${BASE}/library/stats`);
}

export function updateAlbum(id: number, data: { title?: string; artist_id?: number; artist_name?: string; year?: number; genre?: string; label?: string; catalog_number?: string }) {
  return fetchJSON<Album>(`${BASE}/library/albums/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function batchUpdateAlbums(albumIds: number[], updates: { genre?: string; year?: number; artist_id?: number; artist_name?: string; label?: string }) {
  return fetchJSON<{ updated: number; total: number }>(`${BASE}/library/albums/batch-update`, {
    method: 'POST',
    body: JSON.stringify({ album_ids: albumIds, ...updates }),
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

export async function getMediaServers(): Promise<import('./types').MediaServer[]> {
  const data = await fetchJSON<any>(`${BASE}/network/media-servers`);
  return Array.isArray(data) ? data : data.items ?? [];
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

// --- User Tags ---

export function getTags(itemType?: string) {
  const q = itemType ? `?item_type=${itemType}` : '';
  return fetchJSON<import('./types').UserTag[]>(`${BASE}/tags/${q}`);
}

export function searchTags(query: string) {
  return fetchJSON<import('./types').UserTag[]>(`${BASE}/tags/search?q=${encodeURIComponent(query)}`);
}

export function createTag(name: string, color?: string) {
  return fetchJSON<{ id: number }>(`${BASE}/tags/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export function deleteTag(id: number) {
  return fetchJSON<void>(`${BASE}/tags/${id}`, { method: 'DELETE' });
}

export function updateTag(id: number, name?: string, color?: string) {
  return fetchJSON<void>(`${BASE}/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export function tagItem(tagId: number, itemType: string, itemId: number) {
  return fetchJSON<void>(`${BASE}/tags/${tagId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_type: itemType, item_id: itemId }),
  });
}

export function untagItem(tagId: number, itemType: string, itemId: number) {
  return fetchJSON<void>(`${BASE}/tags/${tagId}/items/${itemType}/${itemId}`, {
    method: 'DELETE',
  });
}

export function batchTag(tagId: number, itemType: string, itemIds: number[]) {
  return fetchJSON<{ tagged: number }>(`${BASE}/tags/${tagId}/items/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_type: itemType, item_ids: itemIds }),
  });
}

export function getTagsForItem(itemType: string, itemId: number) {
  return fetchJSON<import('./types').UserTag[]>(`${BASE}/tags/for/${itemType}/${itemId}`);
}

export function getTagAlbums(tagId: number) {
  return fetchJSON<{ albums: import('./types').Album[]; count: number }>(`${BASE}/tags/${tagId}/albums`);
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

export interface EqBand {
  freq: number;
  gain: number;
  q: number;
}

export interface EqSettings {
  bands: EqBand[];
  enabled: boolean;
}

export function getEq(zoneId: number) {
  return fetchJSON<EqSettings>(`${BASE}/zones/${zoneId}/eq`);
}

export function setEq(zoneId: number, settings: EqSettings) {
  return fetchJSON<EqSettings>(`${BASE}/zones/${zoneId}/eq`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export function getDsp(zoneId: number) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/dsp`);
}

export function setDsp(zoneId: number, body: any) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/dsp`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function getListeningStats() {
  return fetchJSON<any>(`${BASE}/system/stats/listening`);
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
  return fetchJSON<any[]>(`${BASE}/library/smart-playlists/${id}/tracks`).then(tracks =>
    (tracks ?? []).map(t => {
      // Server may return cover as "album_cover" instead of "cover_path" — normalise
      if (!t.cover_path && t.album_cover) t.cover_path = t.album_cover;
      return t as import('./types').Track;
    })
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

// Remove a track by its position (0-based index) in the playlist. The server
// removes by position (POST /tracks/remove); there is no DELETE-by-track-id
// route, so the old removePlaylistTrack(playlistId, trackId) silently 404'd.
export function removePlaylistTrackAt(playlistId: number, position: number) {
  return fetchVoid(`${BASE}/playlists/${playlistId}/tracks/remove`, {
    method: 'POST',
    body: JSON.stringify({ position }),
  });
}

export function reorderPlaylistTracks(playlistId: number, trackIds: number[]) {
  return fetchJSON(`${BASE}/playlists/${playlistId}/tracks`, {
    method: 'PUT',
    body: JSON.stringify({ track_ids: trackIds }),
  });
}

// --- Streaming quality mapping ---

/** Map a streaming track's nested `quality` sub-object to flat Track fields.
 *  The server sends `quality: {codec, sample_rate, bit_depth, channels, bitrate}`
 *  on streaming tracks; we flatten these so existing Track consumers work. */
function mapStreamingQuality(track: any): Track {
  if (track && track.quality && typeof track.quality === 'object') {
    const q = track.quality;
    if (q.codec && !track.format)       track.format = q.codec.toLowerCase();
    if (q.sample_rate && !track.sample_rate) track.sample_rate = q.sample_rate;
    if (q.bit_depth && !track.bit_depth)     track.bit_depth = q.bit_depth;
    if (q.channels && !track.channels)       track.channels = q.channels;
  }
  return track as Track;
}

function mapStreamingTracks(tracks: any[]): Track[] {
  return (tracks ?? []).map(mapStreamingQuality);
}

function mapStreamingAlbums(albums: any[]): Album[] {
  return (albums ?? []).map(a => {
    if (a && a.quality && typeof a.quality === 'object') {
      const q = a.quality;
      if (q.codec && !a.format)           a.format = q.codec.toLowerCase();
      if (q.sample_rate && !a.sample_rate) a.sample_rate = q.sample_rate;
      if (q.bit_depth && !a.bit_depth)     a.bit_depth = q.bit_depth;
    }
    return a as Album;
  });
}

function mapStreamingSearchResult(result: SearchResult): SearchResult {
  return {
    ...result,
    tracks: mapStreamingTracks(result.tracks),
    albums: mapStreamingAlbums(result.albums),
  };
}

/** Map quality on a zone's current_track if present */
function mapZoneQuality(zone: any): Zone {
  if (zone?.current_track) mapStreamingQuality(zone.current_track);
  return zone as Zone;
}

// --- Search ---

export function federatedSearch(q: string, sources?: string[], limit = 20) {
  let url = `${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  if (sources && sources.length > 0) {
    url += `&sources=${sources.join(',')}`;
  }
  return fetchJSON<FederatedSearchResult>(url).then(result => {
    if (result.local) result.local.tracks = mapStreamingTracks(result.local.tracks);
    if (result.services) {
      for (const key of Object.keys(result.services)) {
        result.services[key].tracks = mapStreamingTracks(result.services[key].tracks);
        result.services[key].albums = mapStreamingAlbums(result.services[key].albums);
        // The server's StreamTrack/StreamAlbum carry no `source` field, so a
        // track played from global search had no source and did nothing
        // (DEvir). Stamp the service key as the source so play/queue actions
        // can route these streaming results.
        for (const t of result.services[key].tracks ?? []) if (t && !t.source) t.source = key;
        for (const a of result.services[key].albums ?? []) if (a && !a.source) a.source = key;
      }
    }
    return result;
  });
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

export function audioCheck() {
  return fetchJSON<import('./types').AudioCheckResult>(`${BASE}/system/audio-check`);
}

export function getDatabaseStatus() {
  return fetchJSON<any>(`${BASE}/system/database/status`);
}

export function rebuildFts() {
  return fetchJSON<{ status: string; rows_indexed: number; message: string }>(`${BASE}/system/database/rebuild-fts`, { method: 'POST' });
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
  return fetchJSON<{ music_dirs: string[] }>(`${BASE}/system/music-dirs/remove`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export function triggerScan(path?: string, full = false) {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (full) params.set('full', 'true');
  const qs = params.toString();
  const url = qs ? `${BASE}/system/scan?${qs}` : `${BASE}/system/scan`;
  return fetchJSON<{ status: string; music_dirs: string[]; full?: boolean }>(url, { method: 'POST' });
}

export function restartServer() {
  return fetchJSON<{ status: string; message: string }>(`${BASE}/system/restart`, { method: 'POST' });
}

// Peer discovery
export interface TunePeer {
  name: string;
  host: string;
  port: number;
  version: string;
  tracks: number;
  zones: number;
  server_id: string;
}

export function getTunePeers() {
  return fetchJSON<TunePeer[]>(`${BASE}/system/peers`);
}

export function browsePeer(ip: string, port: number = 8888) {
  return fetchJSON<any>(`${BASE}/system/peers/${ip}/browse?port=${port}`, { method: 'POST' });
}

export function transferToPeer(ip: string, port: number = 8888, zoneId: number = 1) {
  return fetchJSON<any>(`${BASE}/system/peers/${ip}/transfer?port=${port}&zone_id=${zoneId}`, { method: 'POST' });
}

export function getScanStatus() {
  return fetchJSON<{ scanning: boolean }>(`${BASE}/system/scan/status`);
}

export function cancelScan() {
  // Server returns 204 No Content — use fetchVoid so the empty body doesn't
  // fail JSON.parse and throw, which would leave the "scanning" banner up (#1129).
  return fetchVoid(`${BASE}/system/scan/cancel`, { method: 'POST' });
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

export function rescanMetadata() {
  return fetchJSON<{ status: string }>(`${BASE}/library/rescan-metadata`, { method: 'POST' });
}

export function rescanMetadataStatus() {
  return fetchJSON<{ status: string; result?: { total?: number; updated?: number; skipped?: number; errors?: number } }>(`${BASE}/library/rescan-metadata/status`);
}

export function mergeAlbumDuplicates() {
  return fetchJSON<{ merged: number }>(`${BASE}/library/albums/merge-duplicates`, { method: 'POST' });
}

export function triggerEnrich() {
  return fetchJSON<{ status: string }>(`${BASE}/system/enrich`, { method: 'POST' });
}

// --- Streaming ---

export function searchStreaming(service: string, q: string, limit = 50) {
  return fetchJSON<SearchResult>(`${BASE}/streaming/${encodeURIComponent(service)}/search?q=${encodeURIComponent(q)}&limit=${limit}`)
    .then(mapStreamingSearchResult);
}

export function getStreamingAlbum(service: string, albumId: string) {
  return fetchJSON<Album>(`${BASE}/streaming/${encodeURIComponent(service)}/albums/${encodeURIComponent(albumId)}`);
}

export function getStreamingAlbumTracks(service: string, albumId: string) {
  return fetchJSON<Track[]>(`${BASE}/streaming/${encodeURIComponent(service)}/albums/${encodeURIComponent(albumId)}/tracks`)
    .then(mapStreamingTracks);
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

export function getStreamingNewReleases(service: string, limit = 50) {
  return fetchJSON<Album[]>(`${BASE}/streaming/${encodeURIComponent(service)}/new-releases?limit=${limit}`);
}

export function getStreamingFeaturedPlaylists(service: string) {
  return fetchJSON<import('./types').StreamingPlaylist[]>(`${BASE}/streaming/${encodeURIComponent(service)}/featured`);
}

export function getStreamingGenres(service: string, parentId?: string) {
  const params = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
  return fetchJSON<import('./types').StreamingGenre[]>(`${BASE}/streaming/${encodeURIComponent(service)}/genres${params}`);
}

export function getStreamingGenreAlbums(service: string, genreId: string, limit = 50) {
  return fetchJSON<Album[]>(`${BASE}/streaming/${encodeURIComponent(service)}/genres/${encodeURIComponent(genreId)}/albums?limit=${limit}`);
}

export function getStreamingPlaylists(service: string) {
  return fetchJSON<import('./types').StreamingPlaylist[]>(`${BASE}/streaming/${encodeURIComponent(service)}/playlists`);
}

export function getStreamingFavorites(service: string, type: 'tracks' | 'albums' | 'artists') {
  return fetchJSON<Record<string, any[]>>(`${BASE}/streaming/${encodeURIComponent(service)}/favorites/${type}`)
    .then(data => {
      // Map quality sub-object on favorite tracks
      if (type === 'tracks' && data?.tracks) {
        data.tracks = mapStreamingTracks(data.tracks);
      }
      return data;
    });
}

export function addStreamingFavorite(service: string, type: 'tracks' | 'albums' | 'artists', itemId: string) {
  return fetchJSON<{ok: boolean}>(`${BASE}/streaming/${encodeURIComponent(service)}/favorites/${type}/${encodeURIComponent(itemId)}`, { method: 'POST' });
}

export function removeStreamingFavorite(service: string, type: 'tracks' | 'albums' | 'artists', itemId: string) {
  return fetchJSON<{ok: boolean}>(`${BASE}/streaming/${encodeURIComponent(service)}/favorites/${type}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
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
  return fetchJSON<Track[]>(`${BASE}/streaming/${encodeURIComponent(service)}/playlists/${encodeURIComponent(playlistId)}/tracks`)
    .then(mapStreamingTracks);
}

// --- YouTube Music OAuth ---

export function youtubeAuthDeviceCode() {
  return fetchJSON<{ user_code: string; verification_url: string; device_code: string; expires_in: number }>(
    `${BASE}/streaming/youtube/auth/device-code`,
    { method: 'POST' },
  );
}

export function youtubeAuthPoll(deviceCode: string) {
  return fetchJSON<{ authenticated?: boolean; pending?: boolean; email?: string }>(
    `${BASE}/streaming/youtube/auth/poll`,
    { method: 'POST', body: JSON.stringify({ device_code: deviceCode }) },
  );
}

export function youtubeAuthLogout() {
  return fetchJSON<any>(
    `${BASE}/streaming/youtube/auth/logout`,
    { method: 'POST' },
  );
}

export function youtubeAuthStatus() {
  return fetchJSON<{ authenticated: boolean; email: string | null }>(
    `${BASE}/streaming/youtube/auth/status`,
  );
}

// --- YouTube Music browse (ytmusicapi) ---

export function getYouTubeHome() {
  return fetchJSON<{ sections: { id: string; name: string }[]; data: Record<string, Album[]> }>(`${BASE}/streaming/youtube/home`);
}

export function getYouTubeCharts(country = 'FR') {
  return fetchJSON<Record<string, any[]>>(`${BASE}/streaming/youtube/charts?country=${encodeURIComponent(country)}`);
}

export function getYouTubeMoods() {
  return fetchJSON<{ title: string; items: { title: string; params: string }[] }[]>(`${BASE}/streaming/youtube/moods`);
}

export function getYouTubeMoodPlaylists(params: string) {
  return fetchJSON<{ title: string; playlistId: string; description: string; cover_path: string | null }[]>(`${BASE}/streaming/youtube/moods/${encodeURIComponent(params)}`);
}

export function getYouTubeLibrary(limit = 100) {
  return fetchJSON<Track[]>(`${BASE}/streaming/youtube/library?limit=${limit}`);
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
// Voir lib/api/metadata.ts. Re-exporté ici pour rétro-compat.
export * from './api/metadata';

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
  const bytes = new Uint8Array(await file.arrayBuffer());
  const response = await fetch(`${BASE}/radios/import/m3u`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
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

// Server favorites API is keyed by {item_type, item_id}; the web callers pass
// {track_id|album_id|artist_id}. Normalise here so callers stay ergonomic.
function favItem(p: { track_id?: number; album_id?: number; artist_id?: number }): { item_type: 'track' | 'album' | 'artist'; item_id: number } | null {
  if (p.track_id != null) return { item_type: 'track', item_id: p.track_id };
  if (p.album_id != null) return { item_type: 'album', item_id: p.album_id };
  if (p.artist_id != null) return { item_type: 'artist', item_id: p.artist_id };
  return null;
}

export function getTrack(id: number) {
  return fetchJSON<import('./types').Track>(`${BASE}/library/tracks/${id}`);
}

// The server returns favorites as a FLAT list of rows
// (`[{ item_type, item_id, ... }]`), but every caller (FavoritesView, the
// favorite-id stores) expects them grouped and EXPANDED as
// `{ tracks: Track[], albums: Album[], artists: Artist[] }`. Adapt here: group
// the ids by type, then expand each via its by-id endpoint. Failed lookups
// (e.g. a favorited item since deleted) are dropped rather than breaking the set.
export async function getFavorites(
  profileId: number,
  type?: 'track' | 'album' | 'artist',
): Promise<{
  tracks: import('./types').Track[];
  albums: import('./types').Album[];
  artists: import('./types').Artist[];
}> {
  const q = type ? `?item_type=${type}` : '';
  const rows = await fetchJSON<Array<{ item_type: string; item_id: number }>>(
    `${BASE}/profiles/${profileId}/favorites${q}`,
  );

  const ids = (t: string) => rows.filter((r) => r.item_type === t).map((r) => r.item_id);
  const settle = async <T>(vals: number[], fetchOne: (id: number) => Promise<T>): Promise<T[]> => {
    const res = await Promise.allSettled(vals.map(fetchOne));
    return res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  };

  const [tracks, albums, artists] = await Promise.all([
    settle(ids('track'), getTrack),
    settle(ids('album'), getAlbum),
    settle(ids('artist'), getArtist),
  ]);
  return { tracks, albums, artists };
}

export function addFavorite(profileId: number, body: { track_id?: number; album_id?: number; artist_id?: number }) {
  const it = favItem(body);
  if (!it) return Promise.reject(new Error('addFavorite: no item id'));
  return fetchJSON<any>(`${BASE}/profiles/${profileId}/favorites/add`, {
    method: 'POST',
    body: JSON.stringify(it),
  });
}

export function removeFavorite(profileId: number, params: { track_id?: number; album_id?: number; artist_id?: number }) {
  const it = favItem(params);
  if (!it) return Promise.reject(new Error('removeFavorite: no item id'));
  return fetchVoid(`${BASE}/profiles/${profileId}/favorites/remove`, {
    method: 'POST',
    body: JSON.stringify(it),
  });
}

export async function checkFavorite(profileId: number, params: { track_id?: number; album_id?: number; artist_id?: number }) {
  const it = favItem(params);
  if (!it) return { is_favorite: false };
  // Server exposes a batch check (POST {item_type, item_ids}) returning an
  // array of {item_id, is_favorite}.
  const res = await fetchJSON<Array<{ item_id: number; is_favorite: boolean }>>(`${BASE}/profiles/${profileId}/favorites/check`, {
    method: 'POST',
    body: JSON.stringify({ item_type: it.item_type, item_ids: [it.item_id] }),
  });
  return { is_favorite: Array.isArray(res) ? !!res[0]?.is_favorite : false };
}

// --- Artwork ---

export function artworkUrl(coverPath: string | null | undefined, size?: number): string {
  if (!coverPath) return '';
  // Server already returns usable relative URLs for cover_path
  // (e.g. /api/v1/library/artwork/abc.jpg or /api/v1/library/artwork/proxy?url=...).
  // Detect these and use them directly.
  if (coverPath.startsWith('/api/')) {
    return coverPath;
  }
  if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return `${BASE}/library/artwork/proxy?url=${encodeURIComponent(coverPath)}`;
  }
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

export async function getUpdateStatus(): Promise<any> {
  const res = await fetch(`${BASE}/system/update/status`);
  return res.json();
}

// --- Network / SMB ---

export function discoverSmbShares() {
  return fetchJSON<any[]>(`${BASE}/network/shares`);
}

export function scanHost(host: string, protocol?: string, username?: string, password?: string) {
  let url = `${BASE}/network/scan-host?host=${encodeURIComponent(host)}`;
  if (protocol) url += `&protocol=${encodeURIComponent(protocol)}`;
  if (username) url += `&username=${encodeURIComponent(username)}`;
  if (password) url += `&password=${encodeURIComponent(password)}`;
  return fetchJSON<any>(url);
}

export function listHostShares(hostId: string) {
  return fetchJSON<{ shares: string[] }>(`${BASE}/network/shares/${encodeURIComponent(hostId)}`);
}

export function testSmbConnection(host: string, share: string, username?: string, password?: string, _domain?: string) {
  return fetchJSON<{ ok: boolean; message?: string; error?: string }>(`${BASE}/network/smb/mount`, {
    method: 'POST',
    body: JSON.stringify({ host, share_name: share, username, password, dry_run: true }),
  });
}

export function mountSmbShare(host: string, share: string, username?: string, password?: string) {
  return fetchJSON<{ mount_path: string; id: number }>(`${BASE}/network/smb/mount`, {
    method: 'POST',
    body: JSON.stringify({ host, share_name: share, username, password }),
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
  return fetchJSON<{ active: boolean; remaining_seconds?: number; fading?: boolean }>(`${BASE}/zones/${zoneId}/sleep`);
}

// --- Queue → Playlist ---

export function saveQueueAsPlaylist(zoneId: number, name?: string) {
  return fetchJSON<any>(`${BASE}/zones/${zoneId}/queue/save-as-playlist`, { method: 'POST', body: JSON.stringify({ name }) });
}

// --- Crossfade ---

export function getCrossfade(zoneId: number) {
  return fetchJSON<{ enabled: boolean; duration: number }>(`${BASE}/zones/${zoneId}/crossfade`);
}

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
  // Server route is POST /collections/{id}/albums/{album_id} (album_id in the
  // path, like the DELETE below). POSTing to /albums with the id in the body
  // matched no route -> 404 "erreur ajout collection".
  return fetchJSON<any>(`${BASE}/library/collections/${collectionId}/albums/${albumId}`, { method: 'POST' });
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

export function podcastCountry(): string {
  try {
    const lang = navigator.language || 'en-US';
    const parts = lang.split('-');
    return (parts[1] || parts[0] || 'us').toLowerCase().slice(0, 2);
  } catch { return 'us'; }
}

export async function searchPodcasts(query: string, limit = 20, country?: string, language?: string): Promise<any[]> {
  const cc = country || podcastCountry();
  let url = `${BASE}/podcasts/search?q=${encodeURIComponent(query)}&limit=${limit}&country=${cc}`;
  if (language) url += `&language=${language}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search podcasts failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.items || data;
}

export async function getRadioFrancePodcasts(): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/radiofrance`);
  if (!res.ok) throw new Error(`Radio France podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getRadioFranceShows(station = 'FRANCEINTER'): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/shows?station=${encodeURIComponent(station)}`);
  if (!res.ok) throw new Error(`RF shows failed: ${res.status}`);
  return res.json();
}

export async function searchRadioFranceShows(query: string): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/shows/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`RF search failed: ${res.status}`);
  return res.json();
}

export async function getRadioFranceEpisodes(showUrl: string, limit = 20): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/episodes?show_url=${encodeURIComponent(showUrl)}&limit=${limit}`);
  if (!res.ok) throw new Error(`RF episodes failed: ${res.status}`);
  return res.json();
}

export async function getPodcastEpisodes(feedUrl: string, limit = 30, showUrl?: string, podcastId?: number | string, sourceId?: string): Promise<any[]> {
  let url: string;
  if (podcastId != null && podcastId !== '') {
    // Prefer the by-id endpoint: the server resolves feed_url from the
    // subscription DB, so this works even when the client's copy of feed_url
    // is empty, and returns an empty list (not a 400) for a broken
    // subscription — avoids the "feed_url query parameter is required" spam
    // that left the podcasts screen empty (Fabien).
    url = `${BASE}/podcasts/episodes/${encodeURIComponent(String(podcastId))}?limit=${limit}`;
    if (feedUrl) url += `&feed_url=${encodeURIComponent(feedUrl)}`;
  } else {
    // Apple top-chart podcasts carry no feed_url — pass their source_id
    // ("apple-…") so the server resolves the feed and episodes preview without
    // subscribing first (Bilou, #1000).
    if (!feedUrl && !showUrl && !sourceId) return []; // nothing to fetch — don't hit the 400
    url = `${BASE}/podcasts/episodes?limit=${limit}`;
    if (feedUrl) url += `&feed_url=${encodeURIComponent(feedUrl)}`;
    else if (sourceId) url += `&source_id=${encodeURIComponent(sourceId)}`;
    if (showUrl) url += `&show_url=${encodeURIComponent(showUrl)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Podcast episodes failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.episodes || data;
}

export async function playPodcastEpisode(zoneId: number, episode: { audio_url: string; title?: string; podcast_name?: string; cover_url?: string; duration_ms?: number }): Promise<any> {
  return fetchJSON(`${BASE}/podcasts/play/${zoneId}`, { method: 'POST', body: JSON.stringify(episode) });
}

export function getPodcastSubscriptions(): Promise<any[]> {
  return fetchJSON(`${BASE}/podcasts/subscriptions`);
}

export function subscribePodcast(podcast: { title: string; feed_url: string; author?: string; image_url?: string; description?: string; source_id?: string }): Promise<any> {
  return fetchJSON(`${BASE}/podcasts/subscriptions`, { method: 'POST', body: JSON.stringify(podcast) });
}

export function unsubscribePodcast(id: number): Promise<void> {
  return fetchVoid(`${BASE}/podcasts/subscriptions/${id}`, { method: 'DELETE' });
}

export async function getTopPodcasts(genreId?: number | null, limit = 50, country?: string): Promise<any[]> {
  const cc = country || podcastCountry();
  let url = `${BASE}/podcasts/top?limit=${limit}&country=${cc}`;
  if (genreId) url += `&genre=${genreId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Top podcasts failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.items || data;
}

export async function getDiscoverPodcasts(): Promise<{ curated: any[]; top: any[]; genres: any[] }> {
  const res = await fetch(`${BASE}/podcasts/discover`);
  if (!res.ok) throw new Error(`Discover podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getPodcastGenres(): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/genres`);
  if (!res.ok) throw new Error(`Podcast genres failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// v0.8.0 — Smart Collections
export function listSmartCollections() {
  return fetchJSON<import('./types').SmartCollection[]>(`${BASE}/library/smart-collections`);
}
export function getSmartCollection(id: number) {
  return fetchJSON<import('./types').SmartCollection>(`${BASE}/library/smart-collections/${id}`);
}
export function createSmartCollection(payload: Omit<Partial<import('./types').SmartCollection>, 'rules'> & { rules: import('./types').SmartRule[] }) {
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
  return fetchJSON<any>(`${BASE}/library/smart-collections/${id}/albums`).then(d =>
    Array.isArray(d) ? d : (d.albums ?? [])
  );
}
export function previewSmartCollection(payload: { rules: any[]; match_mode?: string; sort_by?: string; sort_order?: string; max_albums?: number }) {
  return fetchJSON<import('./types').SmartCollectionPreview>(`${BASE}/library/smart-collections/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// --- CSV Export ---

async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportAlbumsCsv() { return downloadCsv('/export/albums.csv', 'albums.csv'); }
export function exportTracksCsv() { return downloadCsv('/export/tracks.csv', 'tracks.csv'); }
export function exportArtistsCsv() { return downloadCsv('/export/artists.csv', 'artists.csv'); }

// --- Audiophile Mode ---

export function getAudiophileMode(zoneId: number) {
  return fetchJSON<{ enabled: boolean }>(`${BASE}/zones/${zoneId}/audiophile`);
}

export function setAudiophileMode(zoneId: number, enabled: boolean) {
  return fetchJSON<{ enabled: boolean }>(`${BASE}/zones/${zoneId}/audiophile`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

// --- Streaming Quality ---

export function getStreamingQuality(zoneId: number) {
  return fetchJSON<{ quality: string }>(`${BASE}/zones/${zoneId}/quality`);
}

export function setStreamingQuality(zoneId: number, quality: string) {
  return fetchJSON<{ quality: string }>(`${BASE}/zones/${zoneId}/quality`, {
    method: 'POST',
    body: JSON.stringify({ quality }),
  });
}

// --- Config Export/Import ---

export async function exportConfig(): Promise<void> {
  const res = await fetch(`${BASE}/system/config/export`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tune-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importConfig(data: any) {
  return fetchJSON<{ imported: boolean }>(`${BASE}/system/config/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- MusicBrainz Batch Enrichment ---

export function startBatchEnrich() {
  return fetchJSON<{ status: string }>(`${BASE}/library/enrich-all`, { method: 'POST' });
}

export function getBatchEnrichStatus() {
  return fetchJSON<{ running: boolean; processed: number; total: number }>(`${BASE}/library/enrich-all/status`);
}

// Artist image enrichment (community + Fanart/TheAudioDB/MusicBrainz by MBID,
// then Discogs/Last.fm by name). Runs manually for everyone; the automatic
// post-scan run is Premium-only.
export function enrichArtistImages() {
  return fetchJSON<{ status: string; artists_without_image?: number }>(
    `${BASE}/library/artwork/enrich-artists`,
    { method: 'POST' }
  );
}

// YouTube playback: managed yt-dlp helper (opt-in). YouTube blocked Tune's
// native extraction server-side, so playback goes through yt-dlp.
export function getYoutubeStatus() {
  return fetchJSON<{ installed: boolean; version: string | null; status: string }>(
    `${BASE}/system/youtube/status`
  );
}

export function enableYoutubePlayback() {
  return fetchJSON<{ status: string; installed: boolean }>(
    `${BASE}/system/youtube/enable`,
    { method: 'POST' }
  );
}

// --- Network Diagnostics ---

export function getNetworkDiagnostics() {
  return fetchJSON<{
    multicast_ssdp: boolean;
    port_8888: boolean;
    internet: boolean;
    dns_resolution: Record<string, boolean>;
    renderers: Array<{ name: string; host: string; available: boolean }>;
  }>(`${BASE}/system/diagnostics/network`);
}

// --- Scan Schedule ---

export function getScanSchedule() {
  return fetchJSON<{ enabled: boolean; time: string | null }>(`${BASE}/system/scan/schedule`);
}

export function setScanSchedule(time: string, enabled: boolean) {
  return fetchJSON<{ enabled: boolean; time: string | null }>(`${BASE}/system/scan/schedule`, {
    method: 'POST',
    body: JSON.stringify({ time, enabled }),
  });
}

// --- Server Diagnostics Dashboard ---

export function getServerDiagnostics() {
  return fetchJSON<{
    // Server uses "server_version" — client normalises via DiagnosticsView
    server_version: string;
    uptime_seconds: number;
    // Server uses "active_zones" for the zone count
    active_zones: number;
    tracks_count: number;
    albums_count: number;
    artists_count: number;
    // Server uses "connectors" for the list of active streaming service names
    connectors: string[];
    // Memory: server uses "memory_rss_mb"
    memory_rss_mb: number | null;
    // Scan info embedded under scan_status.*
    scan_status: {
      status: string;
      tracks: number;
      albums: number;
      last_result: Record<string, unknown> | null;
    } | null;
  }>(`${BASE}/system/diagnostics`);
}

// --- Library Import (Roon / Plex / Playlists) ---

export interface ImportReport {
  source: string;
  total_rows: number;
  matched: number;
  unmatched: number;
  play_counts_updated: number;
  ratings_updated: number;
  history_entries_added: number;
  playlists_created: number;
  details: Array<{
    title: string;
    artist: string | null;
    album: string | null;
    matched: boolean;
    match_method: string | null;
    tune_track_id: number | null;
  }>;
}

export interface ImportResponse {
  status?: string;
  task_id?: string;
  // When not background, the report fields are at top level
  source?: string;
  total_rows?: number;
  matched?: number;
  unmatched?: number;
  play_counts_updated?: number;
  ratings_updated?: number;
  history_entries_added?: number;
  playlists_created?: number;
  details?: ImportReport['details'];
}

export async function importRoon(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/library/import/roon?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import Roon failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<ImportReport>;
}

export async function importPlex(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/library/import/plex?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import Plex failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<ImportReport>;
}

export async function importPlaylists(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/library/import/playlists?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import playlists failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<ImportReport>;
}

export interface LinnImportResult {
  id: number;
  name: string;
  total_entries: number;
  matched: number;
  not_found: number;
  track_count: number;
}

/** Import a Linn `.dpl` playlist: parses it, matches tracks to the library and
 *  creates a Tune playlist. Returns match stats. */
export async function importLinnPlaylist(file: File): Promise<LinnImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/playlists/import/linn`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import Linn playlist failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<LinnImportResult>;
}

// --- Plugins ---

export interface InstalledPlugin {
  name: string;
  version: string;
  status: 'active' | 'disabled' | 'error';
  description: string;
  error_message?: string;
}

export interface StorePlugin {
  name: string;
  display_name: string;
  description: string;
  category: string;
  author: string;
  install_count: number;
  version: string;
  platforms?: string;
}

/** Merged plugin (catalog + local install state) from /api/v1/plugins */
export interface MergedPlugin {
  name: string;
  display_name: string;
  description: string;
  version: string;
  category: string;
  author?: string;
  icon?: string;
  install_count?: number;
  platforms?: string;
  compatible: boolean;
  installed: boolean;
  /** Server may send enabled instead of status for built-in plugins */
  enabled?: boolean;
  installed_version?: string | null;
  update_available: boolean;
  status: 'available' | 'active' | 'disabled' | 'error';
  error_message?: string | null;
  source?: string;
  min_tune_version?: string;
  max_tune_version?: string;
  is_featured?: boolean;
}

export function getInstalledPlugins(): Promise<InstalledPlugin[]> {
  return fetchJSON<InstalledPlugin[]>(`${BASE}/plugins`);
}

export function enablePlugin(name: string): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>(`${BASE}/system/plugins/${encodeURIComponent(name)}/enable`, { method: 'POST' });
}

export function disablePlugin(name: string): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>(`${BASE}/system/plugins/${encodeURIComponent(name)}/disable`, { method: 'POST' });
}

export async function getStorePlugins(search?: string, category?: string): Promise<StorePlugin[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  const qs = params.toString();
  const url = `https://mozaiklabs.fr/api/v1/plugins${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Store fetch failed (${res.status})`);
  return res.json();
}

/** Fetch merged plugin list (catalog + local) from the Tune server. */
export function getMergedPlugins(): Promise<MergedPlugin[]> {
  return fetchJSON<MergedPlugin[]>(`${BASE}/plugins`);
}

/** Get details for a single plugin by slug. */
export function getPluginDetail(slug: string): Promise<MergedPlugin> {
  return fetchJSON<MergedPlugin>(`${BASE}/plugins/${encodeURIComponent(slug)}`);
}

/** Install a plugin via the server (pip install). */
export function installPlugin(slug: string): Promise<{ success: boolean; message: string; restart_required: boolean }> {
  return fetchJSON(`${BASE}/plugins/${encodeURIComponent(slug)}/install`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Uninstall a plugin via the server (pip uninstall). */
export function uninstallPlugin(slug: string): Promise<{ success: boolean; message: string; restart_required: boolean }> {
  return fetchJSON(`${BASE}/plugins/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

/** Update a plugin to the latest version via the server (pip install --upgrade). */
export function updatePlugin(slug: string): Promise<{ success: boolean; message: string; restart_required: boolean }> {
  return fetchJSON(`${BASE}/plugins/${encodeURIComponent(slug)}/update`, { method: 'POST' });
}

// --- Health Monitor ---

export interface HealthCheck {
  status: 'ok' | 'warning' | 'critical';
  [key: string]: any;
}

export interface HealthAlert {
  timestamp: string;
  level: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
}

export interface HealthMonitorResponse {
  status: 'ok' | 'warning' | 'critical';
  uptime_seconds: number;
  checks: Record<string, HealthCheck>;
  alerts: HealthAlert[];
}

export function getHealthMonitor(): Promise<HealthMonitorResponse> {
  return fetchJSON<HealthMonitorResponse>(`${BASE}/system/health/monitor`);
}

export function getHealthAlerts(): Promise<HealthAlert[]> {
  return fetchJSON<HealthAlert[]>(`${BASE}/system/health/alerts`);
}

// --- Admin Dashboard ---

export interface AdminHealth {
  cpu_percent: number;
  ram_mb: number;
  ram_total_mb: number;
  disk_free_gb: number;
  disk_total_gb: number;
  uptime_seconds: number;
  uptime_formatted: string;
  open_fds: number;
  pid: number;
  python_threads: number;
}

export interface AdminZone {
  id: number;
  name: string;
  state: string;
  output_type: string;
  device_name: string;
  online: boolean;
  current_track: { title: string; artist_name: string; album_title: string; duration_ms: number } | null;
  position_ms: number;
  volume: number;
  buffer: { size_kb: number; fill_percent: number } | null;
  group_id: string | null;
}

export interface AdminError {
  ts: string;
  level: string;
  event: string;
  [key: string]: unknown;
}

export interface AdminConnections {
  websocket_connections: number;
  http_streamer_sessions: number;
}

export interface AdminDiscoveryDevice {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  available: boolean;
  capabilities: Record<string, unknown>;
}

export interface AdminDiscovery {
  devices: AdminDiscoveryDevice[];
  protocols: Record<string, boolean>;
  device_count: number;
}

export function getAdminHealth() {
  return fetchJSON<AdminHealth>(`${BASE}/system/admin/health`);
}

export function getAdminZones() {
  return fetchJSON<AdminZone[]>(`${BASE}/system/admin/zones`);
}

export function getAdminErrors() {
  return fetchJSON<AdminError[]>(`${BASE}/system/admin/errors`);
}

export function getAdminConnections() {
  return fetchJSON<AdminConnections>(`${BASE}/system/admin/connections`);
}

export function getAdminDiscovery() {
  return fetchJSON<AdminDiscovery>(`${BASE}/system/admin/discovery`);
}

// Service tokens (API keys for third-party services like Last.fm, Discogs, etc.)
export interface ServiceTokenField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required: boolean;
}
export interface ServiceTokenInfo {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  fields: ServiceTokenField[];
}
export interface ServiceTokenSaveResult {
  valid: boolean | null;
  validation_message?: string;
}

export function listServiceTokens(): Promise<ServiceTokenInfo[]> {
  return fetchJSON<ServiceTokenInfo[]>(`${BASE}/services/tokens`);
}

export function saveServiceToken(serviceId: string, data: Record<string, string>): Promise<ServiceTokenSaveResult> {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${encodeURIComponent(serviceId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function testServiceToken(serviceId: string): Promise<ServiceTokenSaveResult> {
  return fetchJSON<ServiceTokenSaveResult>(`${BASE}/services/tokens/${encodeURIComponent(serviceId)}/test`, {
    method: 'POST',
  });
}

export function deleteServiceToken(serviceId: string): Promise<void> {
  return fetchJSON<void>(`${BASE}/services/tokens/${encodeURIComponent(serviceId)}`, {
    method: 'DELETE',
  });
}

// --- Smart AI Playlists ---

export function smartAIMood(body: { mood: string; limit?: number }) {
  return fetchJSON<{ tracks: import('./types').Track[]; name?: string }>(`${BASE}/smart-ai/mood`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function smartAIGenerate(body: { prompt: string; limit?: number }) {
  return fetchJSON<{ tracks: import('./types').Track[]; name?: string }>(`${BASE}/smart-ai/generate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function smartAIHistoryBased(body: { limit?: number; days?: number }) {
  return fetchJSON<{ tracks: import('./types').Track[]; name?: string }>(`${BASE}/smart-ai/history-based`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function smartAIDiscovery(body: { limit?: number }) {
  return fetchJSON<{ tracks: import('./types').Track[]; name?: string }>(`${BASE}/smart-ai/discovery`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function smartAITempoMatch(body: { target_bpm: number; tolerance?: number; limit?: number }) {
  return fetchJSON<{ tracks: import('./types').Track[]; name?: string }>(`${BASE}/smart-ai/tempo-match`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// --- Home Dashboard ---
export function getHomePage() {
  return fetchJSON<{ sections: any[] }>(`${BASE}/home`);
}

export function getContinueListening(limit = 20) {
  return fetchJSON<any[]>(`${BASE}/home/continue-listening?limit=${limit}`);
}

export function getRecentlyAdded() {
  return fetchJSON<any[]>(`${BASE}/home/recently-added`);
}

export function getHomeRecommendations() {
  return fetchJSON<any[]>(`${BASE}/home/recommendations`);
}

export function getTopMixes() {
  return fetchJSON<any[]>(`${BASE}/home/top-mixes`);
}

export function getRadioPicks() {
  return fetchJSON<any[]>(`${BASE}/home/radio-picks`);
}

// --- Onboarding ---
export function getOnboardingStatus() {
  return fetchJSON<{ complete: boolean; current_step: number }>(`${BASE}/onboarding/status`);
}

export function onboardingStep(step: string, body?: any) {
  return fetchJSON(`${BASE}/onboarding/step/${step}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function skipOnboarding() {
  return fetchJSON(`${BASE}/onboarding/skip`, { method: 'POST' });
}

// --- Offline Manager ---
export function getOfflineStatus() {
  return fetchJSON<{ total: number; size_bytes: number; pending: number }>(`${BASE}/offline/status`);
}

export function getOfflineDownloads() {
  return fetchJSON<any[]>(`${BASE}/offline/downloads`);
}

export function downloadForOffline(body: { source: string; source_id: string; type: string }) {
  return fetchJSON(`${BASE}/offline/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function removeOfflineDownload(id: string) {
  return fetchJSON(`${BASE}/offline/downloads/${id}`, { method: 'DELETE' });
}

export function syncOffline() {
  return fetchJSON(`${BASE}/offline/sync`, { method: 'POST' });
}

export function clearOffline() {
  return fetchJSON(`${BASE}/offline/clear`, { method: 'POST' });
}

// -- OAAT Multi-Room Groups --

export function getOaatGroups(): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups`);
}

export function createOaatGroup(name: string, endpoints: { host: string; port: number }[]): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, endpoints }),
  });
}

export function deleteOaatGroup(id: string): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${id}`, { method: 'DELETE' });
}

export function getOaatGroupStatus(id: string): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${id}`);
}

export function addOaatEndpoint(groupId: string, host: string, port: number): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${groupId}/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, port }),
  });
}

export function removeOaatEndpoint(groupId: string, endpointId: string): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${groupId}/endpoints/${endpointId}`, {
    method: 'DELETE',
  });
}

export function setOaatGroupVolume(groupId: string, level: number): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${groupId}/volume`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
}

export function setOaatEndpointVolume(groupId: string, endpointId: string, level: number): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${groupId}/endpoints/${endpointId}/volume`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
}

export function setOaatEndpointVolumeOffset(groupId: string, endpointId: string, offset: number): Promise<any> {
  return fetchJSON(`${BASE}/zone-manager/oaat-groups/${groupId}/endpoints/${endpointId}/volume`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset }),
  });
}

// --- License / Premium ---

export interface LicenseFeature {
  enabled: boolean;
  display_name: string;
}

export interface LicenseStatus {
  tier: string;
  license_key: string | null;
  expires_at: string | null;
  features: Record<string, LicenseFeature>;
  zone_limit: number;
  hardware_fingerprint: string | null;
}

export interface LicenseActivateResponse {
  status: string;
  tier: string;
}

export function getLicenseStatus(): Promise<LicenseStatus> {
  return fetchJSON<LicenseStatus>(`${BASE}/cloud/license/status`);
}

export function activateLicense(licenseKey: string): Promise<LicenseActivateResponse> {
  return fetchJSON<LicenseActivateResponse>(`${BASE}/cloud/license/activate`, {
    method: 'POST',
    body: JSON.stringify({ license_key: licenseKey }),
  });
}

export function deactivateLicense(): Promise<LicenseActivateResponse> {
  return fetchJSON<LicenseActivateResponse>(`${BASE}/cloud/license/deactivate`, {
    method: 'POST',
  });
}

export function validateLicense(): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>(`${BASE}/cloud/license/validate`, {
    method: 'POST',
  });
}

// --- Audio Converter ---

export function getConverterPresets(): Promise<{ id: string; label: string; format: string; quality: string; sample_rate: string; bit_depth: string; estimated_size_per_min: string }[]> {
  return fetchJSON(`${BASE}/converter/presets`);
}

export function startConversion(
  // The server expects a flat array of sources, each an album, a track or a
  // path (Vec<ConvertSource>) — NOT a {type, ids} object, and numeric
  // sample_rate/bit_depth (Option<u32>/u16), not strings. Sending the old shape
  // 422'd (Reivax66/Bilou, #1094/#1095).
  sources: Array<{ album_id?: number; track_id?: number; path?: string }>,
  format: string,
  quality: string,
  sampleRate: number | null,
  bitDepth: number | null,
): Promise<{ job_id: string; total_tracks: number }> {
  return fetchJSON(`${BASE}/converter/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources, format, quality, sample_rate: sampleRate, bit_depth: bitDepth }),
  });
}

export function getConversionStatus(jobId: string): Promise<{
  state: 'converting' | 'done' | 'error';
  progress: number;
  current_file: string;
  converted: number;
  total: number;
  download_size?: string;
  error?: string;
}> {
  return fetchJSON(`${BASE}/converter/status/${encodeURIComponent(jobId)}`);
}

export async function downloadConversion(jobId: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/converter/download/${encodeURIComponent(jobId)}`, { headers });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function cancelConversion(jobId: string): Promise<{ status: string }> {
  return fetchJSON(`${BASE}/converter/cancel/${encodeURIComponent(jobId)}`, {
    method: 'POST',
  });
}

// --- Audio File Upload (drag & drop) ---

export async function uploadAudioFile(file: File): Promise<{
  file_id: string;
  file_path: string;
  title: string;
  artist?: string;
  album?: string;
  duration_ms: number;
  format: string;
  sample_rate?: number;
  bit_depth?: number;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/zones/upload`, { method: 'POST', headers, body: formData });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
  return resp.json();
}

export function playUploadedFile(zoneId: number, filePath: string, meta?: { title?: string; artist_name?: string; album_title?: string; duration_ms?: number }) {
  return fetchJSON(`${BASE}/zones/${zoneId}/play`, {
    method: 'POST',
    body: JSON.stringify({ temp_file_path: filePath, ...meta }),
  });
}
