// REST API client for tune-server

import { notifications } from './stores/notifications';
import { getToken, clearToken } from './auth';
import { get } from 'svelte/store';
import { locale, t } from './i18n';
import { profileHeader } from './profileHeader';

/** Server error codes worth turning into a user toast. Play/next/resume callers
 *  don't await the promise, so without this these failures are silent — the
 *  track just doesn't play with no explanation (Yacine: NAS share offline;
 *  JP: moved file; orphaned zone with no output device). */
const PLAY_ERROR_KEYS: Record<string, string> = {
  file_not_found: 'playback.errorFileNotFound',
  zone_no_output_device: 'playback.errorNoOutputDevice',
};

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

import { baseApi, entetesRelais } from './bridge';

/**
 * Base des appels d'API.
 *
 * `/api/v1` en local — inchange. Servie par le relais Tune Bridge, la page
 * pointe vers `/api/relay/{server_id}`, qui remplace exactement ce prefixe :
 * les appels qui passent par cette base suivent sans etre touches.
 */
export const BASE = baseApi();

function stripDoubleBase(path: string): string {
  if (path.startsWith(BASE)) return path.slice(BASE.length);
  return path;
}

/** En-tête d'authentification pour les appels qui n'utilisent pas `fetchJSON`
 *  (téléchargements, uploads) : sans lui, un serveur avec l'auth activée
 *  répond 401 alors que le reste de l'interface fonctionne, puisque le jeton
 *  vit en localStorage et non dans un cookie. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { ...extra, ...entetesRelais() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Construit l'erreur d'une reponse HTTP en echec, EN LISANT SON CORPS.
 *
 * Le serveur explique presque toujours pourquoi il refuse :
 *
 *   Json(json!({ "error": format!("mount failed: {stderr}") }))
 *
 * Ce message etait jete. Philippe Landes n'a vu que « 500 Internal Server
 * Error » en montant un partage SMB : la cause exacte — le stderr de
 * `mount.cifs` — avait ete produite, transmise, puis perdue ici. Chaque echec
 * coutait alors un aller-retour avec un testeur pour retrouver une information
 * que la machine avait deja.
 *
 * Robuste par construction : un corps illisible, vide, ou une page d'erreur
 * HTML ramenent au statut seul. On n'echange jamais un message pauvre contre
 * pas de message du tout.
 */
export async function erreurDepuisReponse(resp: Response): Promise<Error> {
  let detail = '';
  try {
    const texte = await resp.text();
    const t = texte.trim();
    if (t) {
      try {
        const j = JSON.parse(t);
        if (typeof j === 'string') detail = j;
        else detail = j?.error ?? j?.message ?? j?.detail ?? '';
      } catch {
        // Pas du JSON. Une page d'erreur HTML n'apprend rien a l'utilisateur ;
        // du texte brut court, si.
        if (!t.startsWith('<')) detail = t;
      }
    }
  } catch {
    // Corps illisible (connexion coupee en cours de lecture) : le statut reste.
  }
  detail = String(detail ?? '').trim();
  // Un stderr de mount.cifs peut etre long ; l'interface doit rester lisible.
  if (detail.length > 300) detail = detail.slice(0, 300) + '…';
  return detail ? new Error(`${resp.status} — ${detail}`) : new Error(`${resp.status}`);
}

// Generic helpers for radio favorites and custom endpoints
export async function apiFetch(path: string): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang(), ...profileHeader() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, { headers });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw await erreurDepuisReponse(resp);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiPost(path: string, body?: any): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang(), ...profileHeader() };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw await erreurDepuisReponse(resp);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiPatch(path: string, body?: any): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang(), ...profileHeader() };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, {
    method: 'PATCH',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw await erreurDepuisReponse(resp);
  const text = await resp.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

export async function apiDelete(path: string): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang(), ...profileHeader() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${stripDoubleBase(path)}`, { method: 'DELETE', headers });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) throw await erreurDepuisReponse(resp);
  const text = await resp.text();
  // Tolerate empty bodies (e.g. HTTP 204 No Content from delete_radio_favorite):
  // a successful delete may return no content, which must not be treated as an error (#1266).
  if (!text.trim()) return null;
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

/** Error thrown by the fetch helpers, carrying the server's structured `error`
 *  code and HTTP status so callers (and fetchJSON's toast layer) can react. */
export interface ApiError extends Error {
  code?: string;
  status?: number;
}

async function apiError(response: Response): Promise<ApiError> {
  let detail = `${response.status} ${response.statusText}`;
  let code: string | undefined;
  try {
    const body = await response.json();
    if (body.detail) detail = body.detail;
    else if (body.message) detail = body.message;
    code = body.error;
  } catch { /* ignore */ }
  const err = new Error(detail) as ApiError;
  err.code = code;
  err.status = response.status;
  return err;
}

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Accept-Language': acceptLang(),
      'Content-Type': 'application/json',
      ...profileHeader(),
      ...entetesRelais(),
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
    } else {
      // Surface actionable playback failures that callers would otherwise
      // swallow (they fire play/next/resume without awaiting): a missing local
      // file or a zone with no output device. Localised so it matches the UI.
      const key = err.code ? PLAY_ERROR_KEYS[err.code] : undefined;
      if (key) notifications.error(get(t)(key as any));
    }
    throw err;
  }
  const text = await response.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().toLowerCase().startsWith('<html')) {
    throw new Error('Expected JSON but received HTML — check the endpoint URL');
  }
  // A 204, or any 2xx with an empty body, is a success with nothing to parse.
  // Many mutating endpoints answer that way; treating it as a parse failure
  // made successful writes surface as errors in the UI (the rating that saved
  // fine but showed "Erreur notation").
  if (response.status === 204 || text.trim() === '') {
    return undefined as T;
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
      ...profileHeader(),
      ...entetesRelais(),
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

/** Préréglages communautaires pour l'appareil d'une zone (#1743) — proxy
 *  serveur vers mozaiklabs ; liste vide si l'appareil n'est pas identifié ou
 *  si le site est injoignable. */
export interface DevicePreset {
  settings: Record<string, unknown>;
  output_type?: string | null;
  occurrences: number;
}
export function getZoneDevicePresets(id: number) {
  return fetchJSON<{ presets: DevicePreset[] }>(`${BASE}/zones/${id}/device-presets`);
}

/** Applique un préréglage communautaire en UN PATCH — clés whitelistées :
 *  tout le reste du JSON communautaire est ignoré (on n'applique jamais des
 *  clés arbitraires venues du réseau sur une zone). */
const PRESET_KEYS = [
  'dlna_native_flac', 'alac_passthrough', 'aac_passthrough', 'dlna_lpcm', 'dlna_cap_16bit',
  'dlna_wav24', 'dlna_play_delay_ms', 'gain_trim_db',
] as const;
export function applyZoneDevicePreset(id: number, settings: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const k of PRESET_KEYS) {
    if (k in settings) body[k] = settings[k];
  }
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Opt-in : la zone s'annonce en MediaRenderer UPnP (JPlay, BubbleUPnP…). */
export function updateZoneUpnpRenderer(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ upnp_renderer: enabled }),
  });
}

/** Trim de gain du renderer, en dB (le serveur borne à ±12 ; 0 = efface). */
export function updateZoneGainTrim(id: number, gainTrimDb: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ gain_trim_db: gainTrimDb }),
  });
}

export function updateZoneSyncDelay(id: number, syncDelayMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ sync_delay_ms: syncDelayMs }),
  });
}

/** Décalage des paroles, en millisecondes (positif = paroles retardées).
 *  Le serveur borne à ±60 s. */
export function updateZoneLyricsOffset(id: number, offsetMs: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ lyrics_offset_ms: Math.round(offsetMs) }),
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

// Volume fixe (bit-perfect) : le serveur épingle aussi le volume à 100 % en
// base quand on l'active, et la zone redémarre à 100 % au lieu du garde-fou
// anti-réveil de 20 % (tune-server-rust#1616).
export function updateZoneFixedVolume(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fixed_volume: enabled }),
  });
}

export function updateZoneDlnaNativeFlac(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_native_flac: enabled }),
  });
}

export function updateZoneAutoplay(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ autoplay_enabled: enabled }),
  });
}

export function updateZoneAlacPassthrough(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ alac_passthrough: enabled }),
  });
}

/** Meme mecanique que l'ALAC (Marco Polo, #1424). Le serveur portait deja le
 *  reglage `aac_passthrough` ; aucun ecran ne l'exposait, donc il etait
 *  inatteignable — signale en 0.9.85 : « Le reglage n'apparait pas. Je le
 *  cherche au meme endroit que pour forcer l'ALAC mais il ne s'y trouve pas ». */
export function updateZoneAacPassthrough(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ aac_passthrough: enabled }),
  });
}

export function updateZoneDlnaLpcm(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_lpcm: enabled }),
  });
}

export function updateZoneDlnaCap16bit(id: number, enabled: boolean) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_cap_16bit: enabled }),
  });
}

/** Per-zone SetAVTransportURI→Play start delay in ms (0 = config default). */
export function updateZoneDlnaPlayDelay(id: number, ms: number) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_play_delay_ms: ms }),
  });
}

/** Catalogue statique marque→modèles (+ quirks) pour la config d'une zone. */
export function getDeviceCatalog() {
  return fetchJSON<import('./types').DeviceCatalog>(`${BASE}/devices/catalog`);
}

/** Affecte la marque + le modèle choisis par l'utilisateur à une zone.
 *  Chaîne vide = efface l'override (retour à la détection UPnP). */
export function updateZoneDevice(id: number, brand: string, model: string) {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ brand, model }),
  });
}

/** Set the "force WAV" mode for a DLNA renderer. The 16-bit LPCM (`dlna_lpcm`)
 *  and 24-bit (`dlna_wav24`) paths are mutually exclusive, so patch both flags
 *  in one request to keep the zone state coherent. */
export function updateZoneWavMode(id: number, mode: 'off' | '16' | '24') {
  return fetchJSON<Zone>(`${BASE}/zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dlna_lpcm: mode === '16', dlna_wav24: mode === '24' }),
  });
}

/** Discovery check: probe a DLNA/OpenHome renderer's GetProtocolInfo and return
 *  which audio formats it advertises. POST (not the apiFetch GET-only helper). */
export function probeRendererCapabilities(id: number) {
  return fetchJSON<import('./types').RendererCapabilities>(`${BASE}/zones/${id}/renderer-capabilities`, {
    method: 'POST',
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
  const devices: any[] = Array.isArray(data) ? data : (data?.devices ?? []);
  // Garantir l'identifiant de registre ici, une fois, plutôt que dans chacun
  // des écrans qui s'en servent. Un serveur antérieur à la 0.9.82 ne l'envoie
  // pas (tune-server-rust#1823) et la clé est connue : `local:<nom>`.
  return devices.map((d) => ({ ...d, id: d.id ?? `local:${d.name}` }));
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

// --- Appariement AirPlay 2 par code PIN ---
//
// Flux en trois temps côté serveur (routes/airplay_pairing.rs, monté sous
// /outputs) pour les récepteurs qui exigent un appariement HomeKit — TV Samsung
// et LG en AirPlay 2 seul, Apple TV : on démarre l'appariement, le récepteur
// affiche un code à l'écran, on interroge le statut jusqu'à ce qu'il le
// réclame, puis on renvoie le code saisi.
//
// Ces trois fonctions manquaient purement et simplement, alors que
// AirplayPairingModal les appelait : chaque tentative d'appariement échouait sur
// un TypeError « api.startAirplayPairing is not a function », affiché tel quel
// dans la modale. Rien ne pouvait le détecter sans vérification de types.

/** Démarre l'appariement : le récepteur affiche son code à l'écran. */
export function startAirplayPairing(deviceId: string) {
  return fetchJSON<{ ok: boolean; status: string }>(
    `${BASE}/outputs/${encodeURIComponent(deviceId)}/airplay/pair-start`,
    { method: 'POST' },
  );
}

/** Statut d'appariement. Valeurs attendues par la modale : `pin_requested`,
 *  `connected`, `failed:<message>`, sinon un état transitoire. */
export function getAirplayPairStatus(deviceId: string) {
  return fetchJSON<{ status: string }>(
    `${BASE}/outputs/${encodeURIComponent(deviceId)}/airplay/pair-status`,
  );
}

/** Envoie le code affiché par le récepteur. */
export function submitAirplayPairPin(deviceId: string, pin: string) {
  return fetchJSON<{ ok: boolean }>(
    `${BASE}/outputs/${encodeURIComponent(deviceId)}/airplay/pair-pin`,
    { method: 'POST', body: JSON.stringify({ pin }) },
  );
}

export function deleteZone(id: number) {
  return fetchVoid(`${BASE}/zones/${id}`, { method: 'DELETE' });
}

/** Supprime toutes les zones et remet à zéro le quota free (3 zones). */
export function deleteAllZones() {
  return fetchVoid(`${BASE}/zones`, { method: 'DELETE' });
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

// Server-side `POST /zone-manager/measure-latency` measures RTT to EVERY zone's
// output in one call and returns `{ latencies: [{ zone_id, rtt_ms,
// estimated_latency_ms, ... }] }`. The old client hit a non-existent
// `/zone-manager/zones/{id}/measure-latency` (404) and read a non-existent
// `latency_ms` field (Pascal: latency button → 404). Call the real route; the
// caller picks its zone's entry out of the array.
export function measureLatency() {
  return fetchJSON<any>(`${BASE}/zone-manager/measure-latency`, { method: 'POST' });
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
  // Le serveur expose `/zones/stereo-pairs` (routes/zones.rs) ; le `/list` en
  // trop était pris pour un `{pair_id}`, d'où un 405 et une liste de paires qui
  // ne se chargeait jamais dans le gestionnaire de zones.
  return fetchJSON<import('./types').StereoPairInfo[]>(`${BASE}/zones/stereo-pairs`);
}

// --- Playback ---

/** Lancer la lecture sur une zone.
 *
 *  Les champs de métadonnées (`title`, `artist_name`, `album_title`,
 *  `cover_path`, `duration_ms`, `media_format`, `sample_rate`) ne sont PAS
 *  nouveaux côté serveur : `routes/playback.rs::PlayRequest` les désérialise
 *  depuis toujours, et c'est par eux qu'une piste DISTANTE — sans ligne en
 *  bibliothèque — dit qui elle est. Ils manquaient seulement à cette
 *  signature, si bien qu'un appelant TypeScript ne pouvait pas les envoyer
 *  sans mentir au compilateur.
 */
// Comme `addToQueue` : les champs descriptifs acceptent `null`, que le serveur
// reçoit en `Option<String>`. Le type `Track` les déclare `string | null`, et
// sans cela chaque appelant devait les blanchir en `undefined`.
export function play(zoneId: number, body?: { track_id?: number; track_ids?: number[]; album_id?: number; playlist_id?: number; source?: Source; source_id?: string; streaming_album_id?: string; streaming_playlist_id?: string; start_index?: number; file_path?: string; title?: string | null; artist_name?: string | null; album_title?: string | null; cover_path?: string | null; duration_ms?: number; media_format?: string; sample_rate?: number }) {
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

// Pas d'`album_id` ici : /queue/add ne l'accepte pas (contrairement au endpoint
// de lecture) et répond 400. Pour enfiler un album, résoudre ses pistes via
// getAlbumTracks() et envoyer `track_ids`.
// Les champs descriptifs acceptent `null` : une pochette, un titre d'album ou
// un artiste absents sont une réponse, et le serveur les reçoit très bien
// (`Option<String>`). Sans le `| null`, tout appelant qui les a FACULTATIFS —
// une piste distante, typiquement, dont le type `Track` les déclare
// `string | null` — devait les blanchir en `undefined` avant d'appeler.
export function addToQueue(zoneId: number, body: { track_id?: number; track_ids?: number[]; source?: Source | 'upload'; source_id?: string; file_path?: string; position?: number; title?: string | null; artist_name?: string | null; album_title?: string | null; cover_path?: string | null; duration_ms?: number }) {
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

/** Fetch the tracks of many albums with bounded concurrency and one retry per
 * album. The collection/smart-collection play buttons used a parallel burst
 * with `.catch(() => [])`: on a busy server a few album fetches failed
 * SILENTLY and the queue was quietly truncated (Sevy: 19 tracks queued out of
 * a 325-track smart collection, playback "stopped" at the end and Next did
 * nothing). Track order follows the albumIds order; `failedAlbums` counts
 * albums that still failed after retry so callers can tell the user. */
export async function getAlbumTracksBatch(
  albumIds: number[],
): Promise<{ tracks: Track[]; failedAlbums: number }> {
  const results: Track[][] = new Array(albumIds.length).fill([]);
  let failedAlbums = 0;
  let next = 0;
  const worker = async () => {
    while (next < albumIds.length) {
      const idx = next++;
      try {
        results[idx] = await getAlbumTracks(albumIds[idx]);
      } catch {
        try {
          results[idx] = await getAlbumTracks(albumIds[idx]);
        } catch {
          failedAlbums++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, albumIds.length) }, worker));
  return { tracks: results.flat(), failedAlbums };
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
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ zone_id: zoneId }),
  }).then(r => r.json());
}

// v0.8.0 multi-room — Sonos / SoCo control plane.
export function listSonosSpeakers() {
  return fetchJSON<import('./types').SonosSpeaker[]>(`${BASE}/sonos/speakers`);
}
// `discoverSonos`, `setSonosGroup` et `unjoinSonosSpeaker` ont ete retirees le
// 21/08/2026 : aucun composant ne les appelait, et leurs routes
// (`/sonos/discover`, `/sonos/groups`, `/sonos/speakers/{uid}/unjoin`)
// n'existent pas cote serveur. Le groupage Sonos reste a ecrire — des DEUX
// cotes, en partant du service UPnP ZoneGroupTopology, que le serveur
// n'interroge pas encore.

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
  // `cover_path` et `top_radios` manquaient à l'appel : le serveur les envoie
  // (tune-core db/history_repo.rs — TopArtistEntry, TopTrackEntry,
  // DashboardData.top_radios) et la vue les lit. Les champs marqués
  // `skip_serializing_if` côté serveur sont optionnels ici.
  top_artists: { artist_name: string; plays: number; listening_ms: number; cover_path?: string | null }[];
  top_albums: { album_title: string; artist_name: string; cover_path: string | null; plays: number; album_id?: number | null; source?: string | null; source_id?: string | null }[];
  top_tracks: { track_id: number | null; title: string; artist_name: string; plays: number; listening_ms: number; cover_path?: string | null; source?: string | null; source_id?: string | null }[];
  /** Absent de la réponse quand la liste est vide (skip_serializing_if). */
  top_radios?: { station_name: string; radio_id: number | null; plays: number; listening_ms: number; cover_url?: string | null; cover_path?: string | null }[];
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

/** Une piste écoutée pendant une case jour×heure de la carte de chaleur.
 *  Miroir de `SlotTrack` côté serveur (tune-core db/history_repo.rs). */
export interface SlotTrack {
  track_id: number | null;
  title: string | null;
  artist_name: string | null;
  album_title: string | null;
  album_id: number | null;
  source: string | null;
  source_id: string | null;
  plays: number;
  last_listened_at: string | null;
}

/** Détail d'une case de la carte de chaleur du tableau de bord.
 *
 *  Cette fonction manquait purement et simplement, alors que DashboardView
 *  l'appelait : `api.getHistoryAtSlot is not a function` était levé puis avalé
 *  par le `try/catch` de `openSlot()`, si bien que le panneau restait vide en
 *  permanence. Le endpoint existe pourtant depuis le début (routes/history.rs
 *  « /at »). Rien ne pouvait le détecter sans vérification de types.
 *
 *  `weekday` est 1-indexé, comme l'attend le serveur. */
export function getHistoryAtSlot(period: DashboardPeriod, weekday: number, hour: number, limit = 50) {
  const params = new URLSearchParams({
    period,
    weekday: String(weekday),
    hour: String(hour),
    limit: String(limit),
  });
  return fetchJSON<{ weekday: number; hour: number; period: string; tracks: SlotTrack[] }>(
    `${BASE}/library/history/at?${params}`,
  );
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

// reportArtistImage (POST /library/artists/{id}/image/report) est remplacé par
// reportMetadata({entity:'artist_image'}) : même effet local (image effacée),
// mais consigné dans metadata_reports et transmis au cloud communautaire.
// L'ancienne route reste servie pour les clients plus anciens.

/** Entities a metadata report can target (server whitelist). */
export type ReportEntity = 'track' | 'album' | 'artist' | 'cover' | 'artist_image' | 'bio' | 'extra';

export interface MetadataReportInput {
  entity: ReportEntity;
  entity_id?: number;
  mbid?: string;
  /** Metadata key being contested (extra reports). */
  field?: string;
  /** Contested value — what the community should unpublish. */
  value?: string;
  reason: string;
  comment?: string;
}

export interface MetadataReportResult {
  reported: boolean;
  entity: string;
  image_cleared: boolean;
  /** False when community sync is off or the backend was unreachable. */
  pushed: boolean;
}

/** Report wrong metadata. Recorded locally, forwarded to the community
 *  backend when community sync is enabled. */
export function reportMetadata(input: MetadataReportInput) {
  return fetchJSON<MetadataReportResult>(`${BASE}/library/reports`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadArtistImage(artistId: number, file: File): Promise<Artist> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE}/library/artists/${artistId}/image/upload`, {
    method: 'POST',
    headers: authHeaders(),
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
  artist?: string;
  country?: string;       // release_country (track_metadata k/v)
  mood?: string;          // mood (track_metadata k/v)
  source_media?: string;  // source_media (track_metadata k/v)
  folder?: string;        // Oxygen folder facet: absolute dir prefix (subtree)
  rating?: number;        // Oxygen rating facet: album rating 1-5 (profile 1)
  collection?: string;    // Oxygen collection facet: manual collection name
  favorite?: string;      // Oxygen favorite facet: 'track' | 'album' (profile 1)
  playlist?: string;      // Oxygen playlist facet: playlist name
  untagged?: string;      // Oxygen untagged facet: 'genre'|'year'|'artist'|'album'|'cover'
  original_year?: number; // Oxygen recording-year facet (albums.original_year)
  limit?: number;
  offset?: number;
}): Promise<{ items: Track[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.folder) params.set('folder', opts.folder);
  if (opts.rating != null) params.set('rating', String(opts.rating));
  if (opts.collection) params.set('collection', opts.collection);
  if (opts.genre) params.set('genre', opts.genre);
  if (opts.format) params.set('format', opts.format);
  if (opts.sample_rate != null) params.set('sample_rate', String(opts.sample_rate));
  if (opts.bit_depth != null) params.set('bit_depth', String(opts.bit_depth));
  if (opts.year != null) params.set('year', String(opts.year));
  if (opts.source) params.set('source', opts.source);
  if (opts.label) params.set('label', opts.label);
  if (opts.composer) params.set('composer', opts.composer);
  if (opts.artist) params.set('artist', opts.artist);
  if (opts.country) params.set('country', opts.country);
  if (opts.mood) params.set('mood', opts.mood);
  if (opts.source_media) params.set('source_media', opts.source_media);
  if (opts.q) params.set('q', opts.q);
  params.set('limit', String(opts.limit ?? 200));
  if (opts.offset) params.set('offset', String(opts.offset));
  const raw = await fetchJSON<any>(`${BASE}/library/tracks?${params}`);
  const items: Track[] = Array.isArray(raw) ? raw : (raw.items ?? []);
  const total: number = Array.isArray(raw) ? raw.length : (raw.total ?? items.length);
  return { items, total };
}

export interface FacetValue { value: string; count: number; }

/** Full-library facet counts from the server index (Oxygen rail).
 *  `country`/`mood`/`source` are read from the track_metadata k/v store.
 *  When `filters` are passed, each facet is counted over the narrowed track
 *  set (cumulative faceting) — a facet never filters on its own field, so its
 *  alternatives stay visible. */
export async function getLibraryFacets(
  fields: string[],
  filters?: Record<string, string | number>,
  limit?: number,
): Promise<Record<string, FacetValue[]>> {
  const params = new URLSearchParams({ fields: fields.join(',') });
  if (filters) for (const [k, v] of Object.entries(filters)) params.set(k, String(v));
  // limit=0 means "no limit" (show every value); pass it through so the server
  // drops the LIMIT clause.
  if (limit != null) params.set('limit', String(limit));
  const raw = await fetchJSON<any>(`${BASE}/library/facets?${params}`);
  return (raw && typeof raw === 'object') ? raw : {};
}

/** Une carte album d'Oxygen : les agrégats calculés PAR LE SERVEUR sur la
 *  sélection de facettes courante. Les dériver des pistes chargées donnait des
 *  comptes faux dès qu'un album chevauchait la pagination. */
export interface AlbumDetailed {
  album_id: number;
  title: string | null;
  album_artist: string | null;
  cover_path: string | null;
  label: string | null;
  year: number | null;
  duration_ms: number;
  disc_count: number;
  track_count: number;
  format: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
}

/** Albums agrégés pour la vue cartes. `filters` = les mêmes paramètres de
 *  facette que /library/tracks et /library/facets. */
export async function getAlbumsDetailed(
  filters?: Record<string, string | number>,
  limit = 500,
  offset = 0,
): Promise<{ items: AlbumDetailed[]; total: number }> {
  const params = new URLSearchParams();
  if (filters) for (const [k, v] of Object.entries(filters)) params.set(k, String(v));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return fetchJSON<{ items: AlbumDetailed[]; total: number }>(`${BASE}/library/albums-detailed?${params}`);
}

export interface FolderChild { name: string; path: string; count: number; has_children: boolean; }
export interface FolderCrumb { name: string; path: string; }
export interface FolderFacet { path: string | null; crumbs: FolderCrumb[]; children: FolderChild[]; }

/** Hierarchical folder facet for Oxygen (drill-down). `path` empty/undefined →
 *  the library roots. `filters` are the other active facets (cumulative counts).
 *  Selecting a child folder means filtering /library/tracks?folder=<child.path>. */
export async function getFolderFacet(
  path?: string | null,
  filters?: Record<string, string | number>,
  folderLimit?: number,
): Promise<FolderFacet> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (filters) for (const [k, v] of Object.entries(filters)) params.set(k, String(v));
  if (folderLimit != null) params.set('folder_limit', String(folderLimit));
  const raw = await fetchJSON<any>(`${BASE}/library/folder-facet?${params}`);
  return {
    path: raw?.path ?? null,
    crumbs: Array.isArray(raw?.crumbs) ? raw.crumbs : [],
    children: Array.isArray(raw?.children) ? raw.children : [],
  };
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

/** Result of a natural-language acoustic (CLAP text-tower) search: tracks ranked
 *  by acoustic similarity to the query, each annotated with its cosine score. */
export interface AcousticSearchResult {
  query: string;
  count: number;
  tracks: (Track & { similarity?: number })[];
}

/** Natural-language acoustic search — "warm analog jazz", "driving techno".
 *  Premium; returns an empty list when nothing has been acoustically analysed
 *  yet, and throws (503) when the model can't be provisioned. */
/** État de la brique acoustique : `available` = le binaire l'embarque,
 *  `enabled` = elle est activée sur ce serveur, `analysed_tracks` = ce qui a
 *  déjà été analysé. Sert à ne pas proposer l'écran Ambiance quand il ne peut
 *  rien donner. */
export function getAcousticStatus() {
  return fetchJSON<{ available: boolean; enabled: boolean; analysed_tracks: number }>(
    `${BASE}/library/search/acoustic/status`,
  );
}

export function searchAcoustic(query: string, limit = 50) {
  return apiPost('/library/search/acoustic', { query, limit }) as Promise<AcousticSearchResult>;
}

/** Une ambiance enregistrée : le NOM que l'utilisateur lui donne et la REQUÊTE
 *  envoyée au moteur acoustique. Deux champs distincts, comme les ambiances
 *  fournies : la tour texte est entraînée en anglais, on doit pouvoir appeler
 *  « Jazz feutré » ce qu'on interroge en anglais. Rangé par profil côté
 *  serveur — un localStorage ne suivrait ni le profil ni l'appareil. */
export interface SavedAmbiance {
  id: string;
  name: string;
  query: string;
  created_at: number;
}

export function getAmbiances() {
  return fetchJSON<{ ambiances: SavedAmbiance[] }>(`${BASE}/library/ambiances`);
}

export function createAmbiance(name: string, query: string) {
  return apiPost('/library/ambiances', { name, query }) as Promise<SavedAmbiance>;
}

export function updateAmbiance(id: string, patch: { name?: string; query?: string }) {
  return apiPatch(`/library/ambiances/${encodeURIComponent(id)}`, patch) as Promise<SavedAmbiance>;
}

export function deleteAmbiance(id: string) {
  return apiDelete(`/library/ambiances/${encodeURIComponent(id)}`);
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
    headers: authHeaders(),
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

/** Cherche DANS un serveur de médias, par son action ContentDirectory Search.
 *
 *  `container` restreint au dossier affiché ; `'0'` cherche tout le serveur. */
export function searchMediaServer(serverId: string, query: string, container: string = '0') {
  return fetchJSON<import('./types').MediaServerSearchResult>(
    `${BASE}/network/media-servers/${encodeURIComponent(serverId)}/search` +
      `?q=${encodeURIComponent(query)}&container=${encodeURIComponent(container)}`
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

export function getArtistBio(artistId: number) {
  return fetchJSON<{ bio: string | null; source?: string | null }>(`${BASE}/library/artists/${artistId}/bio`);
}

export function getArtistTimeline(artistId: number) {
  return fetchJSON<any[]>(`${BASE}/library/artists/${artistId}/timeline`);
}

export function getSimilarAlbums(albumId: number, limit = 10) {
  return fetchJSON<import('./types').Album[]>(`${BASE}/library/albums/${albumId}/similar?limit=${limit}`);
}

/** Acoustically similar tracks ("Plus comme ça") — ranked by CLAP-embedding
 *  cosine distance to the seed. Empty `items` when the seed has no embedding. */
export function getSimilarTracks(trackId: number, limit = 50) {
  return fetchJSON<{ seed_track_id: number; count: number; items: import('./types').Track[] }>(
    `${BASE}/library/tracks/${trackId}/similar?limit=${limit}`,
  );
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
  /// Type de filtre (routes/eq_pro.rs) — absent = peak.
  type?: 'peak' | 'low_shelf' | 'high_shelf' | 'low_pass' | 'high_pass' | 'notch';
  /**
   * Canal visé — `0` gauche, `1` droite. **Absent = les deux**, et c'est le
   * défaut : un préréglage enregistré avant cette version n'a pas ce champ et
   * se comporte exactement comme avant.
   *
   * Une pièce dissymétrique — un mur d'un côté, une ouverture de l'autre — ne
   * se corrige pas avec la même courbe des deux côtés.
   */
  channel?: number;
}

export interface EqSettings {
  bands: EqBand[];
  enabled: boolean;
}

/** Reponse de `POST /zones/{id}/eq`. */
export interface EqSetResult extends EqSettings {
  /**
   * Vrai quand le reglage vient d'atteindre le son d'un flux EN COURS.
   *
   * Faux ne veut PAS dire echec : rien ne joue, la zone n'est pas locale, ou
   * elle est en mode PURE. Absent quand le serveur est anterieur a #1725 —
   * d'ou l'`undefined` volontaire dans le type : ne rien afficher plutot que
   * d'affirmer quoi que ce soit d'un serveur qui ne le dit pas.
   */
  applied_live?: boolean;
}

export function getEq(zoneId: number) {
  return fetchJSON<EqSettings>(`${BASE}/zones/${zoneId}/eq`);
}

export function setEq(zoneId: number, settings: EqSettings) {
  return fetchJSON<EqSetResult>(`${BASE}/zones/${zoneId}/eq`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

// Résolution du mode Expert (10/15/31 bandes) — stockée serveur pour que tous
// les clients partagent la même grille.
export function getEqExpertSettings() {
  return fetchJSON<{ expert_bands: number }>(`${BASE}/eq/expert-settings`);
}

export function setEqExpertSettings(expertBands: number) {
  return fetchJSON<{ expert_bands: number }>(`${BASE}/eq/expert-settings`, {
    method: 'POST',
    body: JSON.stringify({ expert_bands: expertBands }),
  });
}

// « Mes presets » EQ — CRUD serveur (routes/eq_pro.rs, stockage KV partagé par
// tous les contrôleurs du serveur → les presets suivent l'utilisateur d'un
// appareil à l'autre). Le preset porte des `bands` {freq,gain,q,type} et un
// `eq_type` ('graphic' | 'parametric'). Mutations gatées Premium (comme l'EQ).
export interface EqProPreset {
  id: string;
  name: string;
  eq_type: string;
  zone_id?: string | null;
  bands: EqBand[];
  created_at?: number;
}

export async function listEqPresets(): Promise<EqProPreset[]> {
  const r = await fetchJSON<{ presets: EqProPreset[] }>(`${BASE}/eq/presets`);
  return Array.isArray(r?.presets) ? r.presets : [];
}

export function createEqPreset(body: { name: string; eq_type: string; bands: EqBand[] }): Promise<EqProPreset> {
  return fetchJSON<EqProPreset>(`${BASE}/eq/presets`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteEqPreset(id: string): Promise<void> {
  return fetchVoid(`${BASE}/eq/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Headphone crossfeed — bleeds a delayed, attenuated copy of each channel
// into the opposite ear so the stereo image sits in front of you instead of
// inside your head. Local output only. Server clamps amount 0..0.5, delay 0..5.
export interface CrossfeedSettings {
  enabled: boolean;
  amount: number;   // 0.0 .. 0.5
  delay_ms: number; // 0.0 .. 5.0
}

// GET /zones/{id}/dsp returns the whole DSP chain for the zone. Fields are
// optional because the server fills in defaults and callers PUT partial
// updates (e.g. only eq_profile, or only crossfeed). Kept open-ended so
// existing callers that pass other DSP sub-objects still type-check.
export interface DspSettings {
  eq_profile?: any;
  crossfeed?: CrossfeedSettings;
  [key: string]: any;
}

export function getDsp(zoneId: number) {
  return fetchJSON<DspSettings>(`${BASE}/zones/${zoneId}/dsp`);
}

export function setDsp(zoneId: number, body: DspSettings) {
  return fetchJSON<DspSettings>(`${BASE}/zones/${zoneId}/dsp`, {
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

/**
 * Nombre de résultats demandé par service, pour TOUS les écrans de recherche.
 *
 * Il existait deux plafonds différents et aucun des deux n'avait été choisi :
 * `SearchView` passait 30 en dur, `searchStreaming` prenait 50 par défaut. Un
 * même mot-clé rendait donc plus de résultats dans un écran que dans l'autre,
 * sans que rien ne l'explique (#2036, signalé par Vincent sur Qobuz).
 *
 * 50 est le plafond de page de l'API Qobuz — demander davantage ne rend pas
 * davantage. Au-delà, il faut paginer, pas augmenter ce nombre.
 */
export const SEARCH_PAGE_LIMIT = 50;

export function federatedSearch(q: string, sources?: string[], limit = SEARCH_PAGE_LIMIT) {
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
  server_id?: string;
  /** false = the peer was added but is not currently reachable. */
  online?: boolean;
}

export function getTunePeers() {
  return fetchJSON<TunePeer[]>(`${BASE}/system/peers`);
}

/** Add another Tune server by IP:port (validated server-side; persisted). */
export function addTunePeer(host: string, port: number = 8888) {
  return fetchJSON<TunePeer>(`${BASE}/system/peers`, {
    method: 'POST',
    body: JSON.stringify({ host, port }),
  });
}

export function removeTunePeer(host: string, port: number = 8888) {
  return fetchJSON<{ ok: boolean }>(`${BASE}/system/peers`, {
    method: 'DELETE',
    body: JSON.stringify({ host, port }),
  });
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

/** Last scan report (persisted server-side, survives restarts). */
export interface ScanReport {
  total_files?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  skipped_unchanged?: number;
  skipped_duplicate?: number;
  skipped_no_metadata?: number;
  metadata_timeout?: number;
  db_insert_failed?: number;
  db_update_failed?: number;
  missing_dirs?: string[];
  missing_dir_reasons?: string[];
  error_dirs?: string[];
  failed_paths?: string[];
}

export function getScanReport() {
  return fetchJSON<ScanReport>(`${BASE}/system/scan/report`);
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
  const res = await fetch(`${BASE}/system/database/import`, { method: 'POST', headers: authHeaders(), body: form });
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
  // L'archive de diagnostic n'est pas dans l'allowlist anonyme du serveur : sans
  // en-tête d'authentification, un serveur avec l'auth activée répondait 401 et
  // l'export de logs devenait impossible — précisément quand on en a besoin.
  const res = await fetch(`${BASE}/system/diagnostics/bundle`, { headers: authHeaders() });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expirée — reconnecte-toi puis relance l’export');
  }
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

// rescanMetadata / rescanMetadataStatus / mergeAlbumDuplicates vivaient AUSSI
// ici, en doublon de lib/api/metadata.ts (mêmes endpoints, autres noms) — la
// version du module, ré-exportée par la barrel, est la seule restante.

export function triggerEnrich() {
  return fetchJSON<{ status: string }>(`${BASE}/system/enrich`, { method: 'POST' });
}

// --- Streaming ---

export function searchStreaming(service: string, q: string, limit = SEARCH_PAGE_LIMIT) {
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

/**
 * Une page de la discographie d'un artiste.
 *
 * `offset` omis vaut 0 côté serveur : un client qui ne pagine pas garde le
 * comportement d'avant. Une page vide signifie « il n'y a plus rien » — c'est
 * ce qui arrête le « voir plus », y compris sur un service qui ne sait pas
 * paginer et qui rend alors vide dès le premier offset non nul.
 */
export function getStreamingArtistAlbums(service: string, artistId: string, offset = 0) {
  const p = offset > 0 ? `?offset=${offset}` : '';
  return fetchJSON<Album[]>(`${BASE}/streaming/${encodeURIComponent(service)}/artists/${encodeURIComponent(artistId)}/albums${p}`);
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

/** Une catégorie de playlists éditoriales et sa rangée, telle que le service
 *  les range lui-même (Qobuz : « Artistes Qobuz », « Humeurs », « Focus »…). */
export interface PlaylistTagGroup {
  id: string;
  name: string;
  playlists: import('./types').StreamingPlaylist[];
}

/** Les playlists éditoriales rangées par catégorie, en un seul appel : le
 *  serveur interroge les tags puis chaque rangée en parallèle. Renvoie un
 *  tableau vide pour les services qui n'ont pas de catégories. */
export function getStreamingFeaturedPlaylistsByTag(service: string, genre?: string) {
  const params = genre ? `?genre=${encodeURIComponent(genre)}` : '';
  return fetchJSON<PlaylistTagGroup[]>(`${BASE}/streaming/${encodeURIComponent(service)}/featured-playlists/by-tag${params}`);
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

// --- Tune-hearted streaming favorites (per profile) ---
// Distinct from getStreamingFavorites(service,type) which reads the service's
// OWN favorites. These are items the user hearted in Tune, stored server-side
// with metadata so no per-item hydration is needed. Works for every service
// (incl. YouTube, which has no server-side favorites API).
export interface StreamingFavorite {
  id: number;
  profile_id: number;
  item_type: 'track' | 'album' | 'artist';
  service: string;
  service_id: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  cover_url?: string | null;
}

export function getProfileStreamingFavorites(
  profileId: number,
  type?: 'track' | 'album' | 'artist',
): Promise<StreamingFavorite[]> {
  const q = type ? `?item_type=${type}` : '';
  return fetchJSON<StreamingFavorite[]>(`${BASE}/profiles/${profileId}/favorites/streaming${q}`);
}

export function addProfileStreamingFavorite(
  profileId: number,
  fav: {
    item_type: 'track' | 'album' | 'artist';
    service: string;
    service_id: string;
    title?: string;
    artist?: string;
    album?: string;
    cover_url?: string;
  },
) {
  return fetchJSON<any>(`${BASE}/profiles/${profileId}/favorites/streaming/add`, {
    method: 'POST',
    body: JSON.stringify(fav),
  });
}

export function removeProfileStreamingFavorite(
  profileId: number,
  params: { item_type: 'track' | 'album' | 'artist'; service: string; service_id: string },
) {
  return fetchVoid(`${BASE}/profiles/${profileId}/favorites/streaming/remove`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
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
  added_at?: number | null;
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
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ service, playlist_id: playlistId, format }),
  });
}

export async function importPlaylistFile(file: File, format: string) {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch(`${BASE}/playlist-manager/import?format=${format}`, { method: 'POST', headers: authHeaders(), body: form });
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

// --- Ingest (ajout de contenu à la bibliothèque) ---
// Voir lib/api/ingest.ts.
export * from './api/ingest';

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
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) throw await apiError(response);
  return response.json();
}

export async function importRadios(file: File): Promise<import('./types').RadioImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const response = await fetch(`${BASE}/radios/import/m3u`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
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
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/system/update/check`, { headers });
  return res.json();
}

export async function installUpdate(force = false): Promise<any> {
  // Must carry the admin token: since v0.9.43, POST /system/update/install is
  // RBAC-gated (admin) when auth is enabled. A bare fetch worked same-origin
  // (tune_session cookie) but 401'd cross-origin/relay — the "MAJ ne marche
  // plus" report. Bearer works regardless of origin (no cookie/CORS-credential
  // dependency).
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // force=true bypasses the server's deferral guards. Since v0.9.68 the server
  // refuses to install while a zone is playing — installing re-execs the
  // process and the music stops mid-track (#1462). The button below the
  // "music is playing" warning is a deliberate answer to that warning, so it
  // forces; anything calling this without a user in front of it must not.
  const url = force
    ? `${BASE}/system/update/install?force=true`
    : `${BASE}/system/update/install`;
  const res = await fetch(url, { method: 'POST', headers });
  // Le REFUS doit remonter. Le serveur répond 409 avec un motif — drapeau
  // .no-auto-update, zone en lecture, scan en cours, installation déjà
  // lancée — et `fetch` ne lève pas sur un 409 : renvoyer `res.json()` seul
  // faisait disparaître l'explication, l'appelant enchaînait sur 180 s
  // d'attente d'un redémarrage qui n'arriverait jamais (#412).
  const body = await res.json().catch(() => ({}));
  return { ...body, ok: res.ok, httpStatus: res.status };
}

export async function getUpdateStatus(): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/system/update/status`, { headers });
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

/**
 * Un partage SMB enregistré, avec l'état RÉEL de son montage.
 *
 * ⚠️ `active` et `mount_state` ne disent pas la même chose, et les confondre
 * redonne exactement le défaut de #1916 :
 *
 * - `active`      : l'INTENTION — « ce partage doit être monté » ;
 * - `mount_state` : le CONSTAT — ce qu'a donné le dernier essai ;
 * - `mounted`     : vérifié à l'instant, sur le système de fichiers.
 *
 * Éric (`ricouxxx`) voyait ses partages « toujours présents sur l'interface »
 * alors que leur remontage avait échoué : rien ne portait le constat.
 */
export interface SmbMount {
  id: number;
  server: string;
  share: string;
  mount_path: string | null;
  username: string | null;
  /** Intention de l'utilisateur, pas état du montage. */
  active: boolean;
  /** Constaté à l'instant sur le système de fichiers. */
  mounted: boolean;
  /** `mounted` | `failed` — `null` quand aucun montage n'a été tenté. */
  mount_state: string | null;
  /** Cause du dernier échec, telle que `mount.cifs` l'a rendue. */
  last_mount_error: string | null;
  /** Dialecte retenu : `negocie`, `2.0`, `1.0`. `null` sur macOS. */
  smb_version: string | null;
}

/**
 * Les partages SMB et leur état. Publié par le serveur depuis la v0.9.91
 * (#1916, #1847) ; aucun écran ne le lisait jusqu'à #2069.
 */
export function listSmbMounts() {
  return fetchJSON<SmbMount[]>(`${BASE}/network/smb/mounts`);
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
  const res = await fetch(`${BASE}/podcasts/radiofrance`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Radio France podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getRadioFranceShows(station = 'FRANCEINTER'): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/shows?station=${encodeURIComponent(station)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`RF shows failed: ${res.status}`);
  return res.json();
}

export async function searchRadioFranceShows(query: string): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/shows/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`RF search failed: ${res.status}`);
  return res.json();
}

export async function getRadioFranceEpisodes(showUrl: string, limit = 20): Promise<any> {
  const res = await fetch(`${BASE}/podcasts/radiofrance/episodes?show_url=${encodeURIComponent(showUrl)}&limit=${limit}`, { headers: authHeaders() });
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
  const res = await fetch(`${BASE}/podcasts/discover`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Discover podcasts failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getPodcastGenres(): Promise<any[]> {
  const res = await fetch(`${BASE}/podcasts/genres`, { headers: authHeaders() });
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
  return fetch(`${BASE}/library/smart-collections/${id}`, { method: 'DELETE', headers: authHeaders() }).then(r => r.json());
}
export function getSmartCollectionAlbums(id: number) {
  return fetchJSON<any>(`${BASE}/library/smart-collections/${id}/albums`).then(d =>
    Array.isArray(d) ? d : (d.albums ?? [])
  );
}
// NB: the server's PreviewRequest expects `max_limit` (same field name as
// create/update), not `max_albums`.
export function previewSmartCollection(payload: { rules: any[]; match_mode?: string; sort_by?: string; sort_order?: string; max_limit?: number }) {
  return fetchJSON<import('./types').SmartCollectionPreview>(`${BASE}/library/smart-collections/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// --- CSV Export ---

async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
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

/**
 * Basculer le mode PURE d'une zone.
 *
 * `applied_live` dit si la bascule a atteint le SON tout de suite, ou seulement
 * au prochain flux. Ce n'est pas un détail : jusqu'à ce que le serveur repousse
 * l'état vers la sortie, cocher PURE allumait le badge pendant que l'égaliseur
 * continuait de filtrer — c'est le signalement de Jean Valjean (#1986).
 *
 * Optionnel à dessein : un serveur antérieur ne renvoie pas le champ, et on
 * n'affirme alors rien de ce qu'il ne dit pas (même règle que `setEq`).
 */
export function setAudiophileMode(zoneId: number, enabled: boolean) {
  return fetchJSON<{ enabled: boolean; applied_live?: boolean }>(
    `${BASE}/zones/${zoneId}/audiophile`,
    {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    },
  );
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
  const res = await fetch(`${BASE}/system/config/export`, { headers: authHeaders() });
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
  // Forme réelle du JSON serveur (routes/library/enrich.rs) : `status` +
  // `enriched`, PAS `running`/`processed` (Fabien-5).
  return fetchJSON<{ status: 'running' | 'done' | 'idle'; enriched: number; errors?: number; total: number }>(
    `${BASE}/library/enrich-all/status`
  );
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

// Progress of the (async, background) artist-image enrichment. The POST above
// returns 202 immediately; the real work — MBID matching then image fetch —
// runs for minutes. `result` mirrors the `artist_artwork_enrich_result` setting
// ({phase,total,processed,enriched}) or is null before the first run.
export function enrichArtistImagesStatus() {
  return fetchJSON<{
    result: { phase?: string; total?: number; processed?: number; enriched?: number } | null;
    artists_without_image: number;
  }>(`${BASE}/library/artwork/enrich-artists/status`);
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

// Les trois imports vivent sous `/system/import/*` côté serveur
// (routes/system/mod.rs), pas sous `/library` : chaque appel partait en 404 et
// l'import Roon/Plex/playlists était intégralement inopérant (#2004).
//
// Ils omettaient AUSSI `authHeaders()`, seuls de tous les envois multipart du
// client. Corriger le seul préfixe aurait remplacé le 404 par un 401 — la
// fonctionnalité serait restée cassée, avec un symptôme différent.

export async function importRoon(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/system/import/roon?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import Roon failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<ImportReport>;
}

export async function importPlex(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/system/import/plex?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Import Plex failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<ImportReport>;
}

export async function importPlaylists(file: File, preview = false): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const url = `${BASE}/system/import/playlists?preview=${preview}`;
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: form });
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
  const res = await fetch(`${BASE}/playlists/import/linn`, { method: 'POST', headers: authHeaders(), body: form });
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
  /** Entrée issue du catalogue marketplace (install via /marketplace). */
  marketplace?: boolean;
  slug?: string;
}

export function getInstalledPlugins(): Promise<InstalledPlugin[]> {
  return fetchJSON<InstalledPlugin[]>(`${BASE}/plugins`);
}

export function enablePlugin(name: string): Promise<{ status: string }> {
  // The server mounts enable/disable under /plugins (routes/plugins.rs), same
  // as install/uninstall/update — not under /system, which only aliases the
  // list. The old /system/plugins/… path 404'd, so the toggle never took.
  return fetchJSON<{ status: string }>(`${BASE}/plugins/${encodeURIComponent(name)}/enable`, { method: 'POST' });
}

export function disablePlugin(name: string): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>(`${BASE}/plugins/${encodeURIComponent(name)}/disable`, { method: 'POST' });
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

export interface MarketplaceCatalogPlugin {
  slug: string;
  name: string;
  display_name?: string | null;
  description: string;
  version: string;
  author: string;
  price?: number | null;
  category: string;
  downloads?: number;
  rating?: number;
  installed: boolean;
  installed_version?: string | null;
  platforms?: string | null;
  install_type?: string | null;
}

/** Catalogue marketplace via le proxy serveur (pas de cross-origin). */
export function getMarketplaceCatalog(): Promise<{ plugins: MarketplaceCatalogPlugin[]; count: number }> {
  return fetchJSON(`${BASE}/marketplace/plugins`);
}

/** Installe un plugin du marketplace : télécharge et persiste le wasm côté serveur. */
export function installMarketplacePlugin(slug: string): Promise<{ status: string; restart_required?: boolean }> {
  return fetchJSON(`${BASE}/marketplace/plugins/${encodeURIComponent(slug)}/install`, { method: 'POST' });
}

export function uninstallMarketplacePlugin(slug: string): Promise<{ status: string; restart_required?: boolean }> {
  return fetchJSON(`${BASE}/marketplace/plugins/${encodeURIComponent(slug)}/uninstall`, { method: 'POST' });
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

// Service tokens : voir lib/api/metadata.ts, déjà ré-exporté en bloc plus haut.
//
// Ce module en hébergeait un doublon appauvri — un `ServiceTokenInfo` à cinq
// champs, là où le serveur en renvoie une vingtaine. Or une déclaration locale
// masque une ré-export étoile : `import { ServiceTokenInfo } from '../lib/api'`
// résolvait donc vers la version incomplète, et tout ce que ServiceTokensView
// affiche (kind, pricing, help_steps, valid, scrobble_*…) était lu sur un type
// qui l'ignorait. Doublon supprimé pour laisser une seule source de vérité.

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

export function getNewInLibrary() {
  return fetchJSON<any[]>(`${BASE}/home/new-in-library`);
}

/** Un artiste et ses parutions recentes, rendu par `/home/artist-releases`. */
export interface ArtistReleaseGroup {
  artist_name: string;
  /** Vrai si l'artiste est dans les favoris — ces groupes viennent en tete. */
  is_favorite: boolean;
  /** Nombre d'albums de cet artiste dans la bibliotheque (0 = suivi seulement). */
  library_albums: number;
  releases: {
    service: string;
    source_id: string;
    title: string;
    cover_path: string | null;
    year: number | null;
  }[];
}

/**
 * Les parutions recentes des artistes qu'on possede ou qu'on aime.
 *
 * Un appel par service connecte cote serveur, pas un par artiste : le cout
 * suit le nombre de services, pas la taille de la bibliotheque.
 */
export function getArtistReleases(limit = 12) {
  return fetchJSON<ArtistReleaseGroup[]>(`${BASE}/home/artist-releases?limit=${limit}`);
}

/** Un groupe rendu par `/home/other-versions` : un morceau, ses autres versions. */
export interface OtherVersionGroup {
  title: string;
  artist_name: string;
  /** L'album depuis lequel le morceau a ete ecoute aujourd'hui. */
  played_album: string;
  versions: {
    track_id: number | null;
    album_id: number | null;
    album_title: string | null;
    cover_path: string | null;
    duration_ms: number | null;
  }[];
}

/**
 * Les autres versions, DANS LA BIBLIOTHEQUE, des morceaux ecoutes aujourd'hui.
 *
 * Ni reprises par un autre interprete (il faudrait les relations d'oeuvre
 * MusicBrainz), ni versions Qobuz (un appel par morceau ecoute). Le serveur
 * fait le regroupement : l'ecran n'a qu'a dessiner.
 */
export function getOtherVersions(limit = 20) {
  return fetchJSON<OtherVersionGroup[]>(`${BASE}/home/other-versions?limit=${limit}`);
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
  /** Real availability (functional), independent of licence entitlement.
   *  Absent on older servers → treated as available. */
  available?: boolean;
}

/** Set when this server's floating licence is currently held by ANOTHER of the
 * user's servers (single-session model). While present, `tier` is `free` here
 * until that server stops pinging — this only explains *why*. */
export interface LicenseSessionConflict {
  active_server: string | null;
  active_since: string | null;
}

export interface LicenseStatus {
  tier: string;
  license_key: string | null;
  expires_at: string | null;
  features: Record<string, LicenseFeature>;
  zone_limit: number;
  hardware_fingerprint: string | null;
  /** Null unless the licence is active on another server right now. */
  session_conflict?: LicenseSessionConflict | null;
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

// Log out of the mozaiklabs.fr cloud account (server drops the stored SSO token).
export function ssoDisconnect(): Promise<{ status?: string }> {
  return fetchJSON<{ status?: string }>(`${BASE}/cloud/sso/disconnect`, {
    method: 'POST',
  });
}

// --- Support Premium v2 (fil de tickets hébergé sur mozaiklabs.fr) ---
//
// Le suivi de conversation parle directement à mozaiklabs.fr (contrat en cours
// de déploiement côté serveur) ; la CRÉATION de ticket, elle, passe toujours
// par le serveur Tune local (POST /support/tickets), qui joint la licence.
// Tant que le serveur mozaiklabs n'est pas déployé, ces appels échouent
// (404/CORS) : les appelants doivent dégrader en douceur, jamais casser l'écran.

export const MOZAIKLABS_API = 'https://mozaiklabs.fr/api/v1';

export type SupportTicketStatus = 'open' | 'answered' | 'resolved';

export interface SupportTicketSummary {
  id: number;
  subject: string;
  category: string | null;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
  unread_count: number;
}

export interface SupportTicketReply {
  id: number;
  author: 'user' | 'team';
  body: string;
  created_at: string;
}

async function mozaikFetch(path: string, options?: RequestInit): Promise<any> {
  const resp = await fetch(`${MOZAIKLABS_API}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  if (!resp.ok) {
    const err = new Error(`${resp.status}`) as ApiError;
    err.status = resp.status;
    throw err;
  }
  const text = await resp.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

export function getSupportTickets(licenseKey: string): Promise<{ tickets: SupportTicketSummary[] }> {
  return mozaikFetch(`/support/tickets?license_key=${encodeURIComponent(licenseKey)}`);
}

export function getSupportTicket(
  id: number,
  licenseKey: string,
): Promise<{ ticket: SupportTicketSummary; replies: SupportTicketReply[] }> {
  return mozaikFetch(`/support/tickets/${id}?license_key=${encodeURIComponent(licenseKey)}`);
}

export function postSupportTicketReply(id: number, licenseKey: string, body: string): Promise<any> {
  return mozaikFetch(`/support/tickets/${id}/replies`, {
    method: 'POST',
    body: JSON.stringify({ license_key: licenseKey, body }),
  });
}

export function markSupportTicketRead(id: number, licenseKey: string): Promise<any> {
  return mozaikFetch(`/support/tickets/${id}/read`, {
    method: 'POST',
    body: JSON.stringify({ license_key: licenseKey }),
  });
}

/** Crée un ticket support en `multipart/form-data` (avec pièces jointes). Poste
 *  vers le serveur Tune local (POST /support/tickets), qui valide les fichiers
 *  puis relaie le multipart à mozaiklabs avec la clé de licence / le token
 *  premium. On NE fixe PAS `Content-Type` : le navigateur pose lui-même le
 *  boundary. Le `FormData` porte les champs du ticket (subject/body/category/…)
 *  et chaque fichier sous `attachments[]`.
 *
 *  En cas d'échec, on privilégie le message FR renvoyé par le serveur (trop
 *  gros / type interdit / trop de fichiers) ; l'`ApiError.status` reste exposé. */
export async function createSupportTicketMultipart(form: FormData): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': acceptLang(),
    ...profileHeader(),
      ...entetesRelais(),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/support/tickets`, { method: 'POST', headers, body: form });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  if (!resp.ok) {
    let message = `${resp.status}`;
    try {
      const data = await resp.json();
      if (data?.message) message = data.message;
    } catch { /* pas de corps JSON exploitable */ }
    const err = new Error(message) as ApiError;
    err.status = resp.status;
    throw err;
  }
  const text = await resp.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
}

/** Fiche système consolidée. Endpoint serveur en cours de déploiement :
 *  404 sur les serveurs antérieurs — les appelants composent alors la fiche
 *  localement (health + stats + zones + licence). */
export function getSystemProfile(): Promise<Record<string, unknown>> {
  return fetchJSON<Record<string, unknown>>(`${BASE}/system/profile`);
}

/** Diagnostics + logs récents rendus en markdown par le serveur — même source
 *  que le signalement de bug forum (#1073), réutilisée pour joindre les logs
 *  à un ticket support. */
export async function getBugReportMarkdown(): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/system/bug-report/markdown`, { headers });
  if (!resp.ok) throw await erreurDepuisReponse(resp);
  return resp.text();
}

// --- Audio Converter ---

export function getConverterPresets(): Promise<{ id: string; label: string; format: string; quality: string; sample_rate: string; bit_depth: string; estimated_size_per_min: string }[]> {
  return fetchJSON(`${BASE}/converter/presets`);
}

// Which formats THIS server can actually produce (#1524): flac/wav/opus are
// native; mp3/aac/alac depend on external tools shipped with the release.
export interface ConverterCapabilities {
  formats: Record<string, boolean>;
  tools: { ffmpeg: string | null; lame: string | null };
}

export function getConverterCapabilities(): Promise<ConverterCapabilities> {
  return fetchJSON(`${BASE}/converter/capabilities`);
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

/** Annuler une conversion en cours.
 *
 *  L'appel visait `POST /converter/cancel/{id}` — ni ce chemin ni ce verbe
 *  n'existent : annuler une conversion échouait en 404, et l'utilisateur
 *  restait devant une tâche qu'il croyait avoir arrêtée (#2004).
 *
 *  La fonction existe pourtant, et complètement : `DELETE /converter/jobs/{id}`
 *  (`routes/converter.rs`) passe la tâche en `Cancelled`, efface son répertoire
 *  de sortie et la retire du registre. Ce n'était donc pas une route à écrire
 *  mais une adresse ET un verbe à corriger — la réponse `{job_id, status}`
 *  correspondait déjà au type déclaré ici. */
export function cancelConversion(jobId: string): Promise<{ status: string }> {
  return fetchJSON(`${BASE}/converter/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
}

// --- Dé-ploc (declick) — premium tool ---
// Cleans transcode/encoder artefacts (encoder delay, padding, clicks) and
// re-exports to a lossless container. Mirrors the converter API block.

export interface DeclickOptions {
  threshold_db: number;
  trim_lead: boolean;
  trim_tail: boolean;
  zero_cross: boolean;
  output_format: 'flac' | 'wav';
}

export function startDeclick(
  sources: Array<{ album_id?: number; track_id?: number; path?: string }>,
  options: DeclickOptions,
): Promise<{ job_id: string; total_tracks: number }> {
  return fetchJSON(`${BASE}/declick/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources, options }),
  });
}

export function getDeclickStatus(jobId: string): Promise<{
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  completed: number;
  total: number;
  current_file: string;
  errors?: string[];
}> {
  return fetchJSON(`${BASE}/declick/status/${encodeURIComponent(jobId)}`);
}

export async function downloadDeclick(jobId: string): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}/declick/download/${encodeURIComponent(jobId)}`, { headers });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function cancelDeclick(jobId: string): Promise<{ status: string }> {
  return fetchJSON(`${BASE}/declick/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
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

// ---- Appliance (Tune OS): host network configuration ----

export interface ApplianceWifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  in_use: boolean;
}

export interface ApplianceStatus {
  appliance: boolean;
  devices: { device: string; type: string; state: string; connection: string | null }[];
  ethernet_connected: boolean;
  wifi_connected: boolean;
  wifi_ssid: string | null;
  wifi_signal: number | null;
}

/** Like apiFetch/apiPost but surfaces the server's JSON error message. */
async function applianceFetch(path: string, body?: any): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Accept-Language': acceptLang(), ...profileHeader() };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { clearToken(); throw new Error('Session expired'); }
  let json: any = null;
  try { json = await resp.json(); } catch { /* non-JSON body */ }
  if (!resp.ok) throw new Error(json?.error || `${resp.status}`);
  return json;
}

export function getApplianceStatus(): Promise<ApplianceStatus> {
  return applianceFetch('/appliance/status');
}

/**
 * Éteindre la machine — appliance Tune OS uniquement.
 *
 * La route n'existe pas ailleurs : sur une installation de bureau, Tune partage
 * la machine avec son utilisateur, et l'éteindre depuis une page web serait au
 * mieux une surprise. Le serveur rend 404 hors appliance, et l'écran
 * n'affiche le bouton que si `getApplianceStatus().appliance` est vrai.
 */
export function applianceShutdown(): Promise<{ status: string }> {
  return applianceFetch('/appliance/shutdown', {});
}

export function applianceWifiScan(): Promise<{ networks: ApplianceWifiNetwork[] }> {
  return applianceFetch('/appliance/wifi/scan');
}

export function applianceWifiConnect(ssid: string, password?: string): Promise<{ connected: boolean; message: string }> {
  return applianceFetch('/appliance/wifi/connect', { ssid, password });
}

export function applianceWifiForget(ssid: string): Promise<{ forgotten: boolean }> {
  return applianceFetch('/appliance/wifi/forget', { ssid });
}

// ---- Appliance (Tune OS): data relocation ----

export interface ApplianceVolume {
  device: string;
  mount_path: string;
  fs: string;
  size_bytes: number;
  free_bytes: number;
  uuid: string | null;
  label: string | null;
  is_data_target: boolean;
}

export interface ApplianceDataStatus {
  db_path: string;
  artwork_dir: string;
  on_external: boolean;
  volume_present: boolean;
  data_size_bytes: number;
  job: {
    phase: string;
    copied_bytes: number;
    total_bytes: number;
    error: string | null;
    target: string;
  } | null;
}

export function getApplianceStorage(): Promise<{
  volumes: ApplianceVolume[];
  disks?: ApplianceDisk[];
  unmounted_partitions?: ApplianceUnmountedPartition[];
}> {
  return apiFetch('/appliance/storage');
}

export function getApplianceDataStatus(): Promise<ApplianceDataStatus> {
  return apiFetch('/appliance/data/status');
}

export function applianceRelocateData(uuid: string): Promise<{ started: boolean }> {
  return apiPost('/appliance/data/relocate', { uuid });
}

// ---- Appliance (Tune OS): disks inventory, music volume mount, install ----

export interface ApplianceDisk {
  name: string;
  size: string;
  model: string;
  tran: string;
  is_boot: boolean;
}

export interface ApplianceUnmountedPartition {
  name: string;
  uuid: string;
  fstype: string;
  size: string;
  label: string;
  tran: string;
  disk: string;
  disk_model: string;
}

export function applianceMountVolume(uuid: string): Promise<{ mount_path: string; label: string | null; fstype: string }> {
  return apiPost('/appliance/storage/mount', { uuid });
}

export function applianceInstallToDisk(device: string): Promise<{ started: boolean }> {
  return apiPost('/appliance/install-to-disk', { device, confirm: 'EFFACER' });
}

export function applianceInstallStatus(): Promise<{ phase: string; written_bytes: number; error: string | null; target: string }> {
  return apiFetch('/appliance/install-to-disk/status');
}

// ---------------------------------------------------------------------------
// Propositions de correction venues de la communaute
// ---------------------------------------------------------------------------

export interface MetadataProposal {
  id: number;
  entity: string;
  local_id: number;
  title: string | null;
  artist: string | null;
  field: string;
  current: string | null;
  proposed: string | null;
  /** Combien de bibliotheques portent la valeur proposee. */
  servers_count: number;
  fetched_at: string;
}

export function listMetadataProposals(
  limit = 100,
): Promise<{ proposals: MetadataProposal[]; pending: number; auto_apply: boolean }> {
  return apiFetch(`/library/proposals?limit=${limit}`);
}

/** `accept: false` compte comme une voix pour la valeur qu'on possede deja. */
export function decideMetadataProposal(
  id: number,
  accept: boolean,
): Promise<{ decided: boolean; decision: string; applied: boolean }> {
  return apiPost(`/library/proposals/${id}/decision`, { accept });
}

export function setMetadataProposalsAutoApply(enabled: boolean): Promise<{ auto_apply: boolean }> {
  return apiPost('/library/proposals/auto-apply', { enabled });
}

// --- Bandcamp (plugin, monté sur /ext/bandcamp) ---

export interface BandcampItem {
  artist: string;
  title: string;
  type: string;
  url: string;
  art_id?: number;
}

export interface BandcampCollectionPage {
  fan_id: number;
  count: number;
  items: BandcampItem[];
  more_available: boolean;
  last_token: string | null;
}

/** Lier un compte Bandcamp par son PSEUDO. Aucun mot de passe : la page de
 *  profil est publique, et Tune ne manipule jamais d'identifiants Bandcamp. */
export function bandcampLink(username: string) {
  return fetchJSON<{ username: string; fan_id: number; linked: boolean }>(
    `${BASE}/ext/bandcamp/collection/link`,
    { method: 'POST', body: JSON.stringify({ username }) },
  );
}

/** Une page de collection. Bandcamp pagine par CURSEUR : on réémet le
 *  `last_token` reçu jusqu'à `more_available === false`. */
export function bandcampCollection(olderThanToken?: string | null, count = 100) {
  const p = new URLSearchParams({ count: String(count) });
  if (olderThanToken) p.set('older_than_token', olderThanToken);
  return fetchJSON<BandcampCollectionPage>(`${BASE}/ext/bandcamp/collection?${p}`);
}

/** Toute la collection, page après page. Un acheteur de longue date en a
 *  plusieurs centaines : la boucle est bornée pour qu'une pagination cassée
 *  côté Bandcamp ne tourne pas indéfiniment. */
export async function bandcampAllCollection(): Promise<BandcampItem[]> {
  const tout: BandcampItem[] = [];
  let jeton: string | null = null;
  for (let page = 0; page < 50; page++) {
    const r: BandcampCollectionPage = await bandcampCollection(jeton);
    tout.push(...(r.items ?? []));
    if (!r.more_available || !r.last_token) break;
    jeton = r.last_token;
  }
  return tout;
}

// --- Bandcamp : explorer le catalogue ---
//
// La collection répond à « qu'ai-je acheté ? ». Ces appels-ci répondent à
// « qu'y a-t-il chez Bandcamp ? » — et c'est ce qui rend l'écran utile à qui
// n'a encore rien acheté, ou dont la collection est vide.
//
// Le serveur normalise les réponses de Bandcamp avant de les rendre : les
// champs ci-dessous sont ceux du plugin, pas ceux de Bandcamp, qui changent
// sans préavis.

/** Un résultat de navigation : album, piste ou artiste. */
export interface BandcampResultat {
  id?: number;
  titre: string;
  artiste: string | null;
  url: string;
  pochette?: string | null;
  genre?: string | null;
  lieu?: string | null;
  /** Extrait mp3-128 offert par Bandcamp, quand il y en a un. */
  extrait?: string | null;
  album?: string | null;
}

export interface BandcampDecouverte {
  tag: string;
  sort: string;
  page: number;
  items: BandcampResultat[];
  qualite: string;
  lossless: boolean;
}

export interface BandcampRecherche {
  q: string;
  artistes: BandcampResultat[];
  albums: BandcampResultat[];
  pistes: BandcampResultat[];
}

export interface BandcampPiste {
  num: number;
  title: string;
  artist: string;
  duration_s: number;
  stream_url: string;
  quality: string;
  track_id?: number;
}

export interface BandcampAlbumDetail {
  title: string;
  artist: string;
  url: string;
  art_id?: number;
  /** Pochette RÉSOLUE par le plugin. Le client ne recompose pas d'URL bcbits
   *  lui-même : c'est l'oubli du préfixe `a` qui produisait des 404 (#1768). */
  pochette?: string | null;
  track_count: number;
  tracks: BandcampPiste[];
  quality: string;
  lossless: boolean;
  quality_note?: string;
}

export interface BandcampSousGenre {
  slug: string;
  label: string;
}

export interface BandcampGenre {
  slug: string;
  label: string;
  sous_genres: BandcampSousGenre[];
}

/**
 * Les genres proposés par Bandcamp, et leurs sous-genres.
 *
 * `genres` est servi par les serveurs qui lisent le catalogue chez Bandcamp ;
 * `tags` reste rendu par tous, y compris les plus anciens. L'appelant retombe
 * donc sur `tags` — sans sous-genres, mais sans écran vide non plus.
 */
export function bandcampTags() {
  return fetchJSON<{ tags: string[]; genres?: BandcampGenre[] }>(`${BASE}/ext/bandcamp/tags`);
}

/** Parcourir un genre, éventuellement restreint à l'un de ses sous-genres. */
export function bandcampDiscover(tag: string, sort = 'top', page = 0, subgenre?: string) {
  const p = new URLSearchParams({ tag, sort, page: String(page) });
  if (subgenre) p.set('subgenre', subgenre);
  return fetchJSON<BandcampDecouverte>(`${BASE}/ext/bandcamp/discover?${p}`);
}

/** Rechercher artistes, albums et pistes. */
export function bandcampSearch(q: string) {
  const p = new URLSearchParams({ q });
  return fetchJSON<BandcampRecherche>(`${BASE}/ext/bandcamp/search?${p}`);
}

/** Résoudre une page publique Bandcamp en pistes écoutables (mp3-128). */
export function bandcampAlbum(url: string) {
  const p = new URLSearchParams({ url });
  return fetchJSON<BandcampAlbumDetail>(`${BASE}/ext/bandcamp/album?${p}`);
}

export interface BandcampDiscographie {
  url: string;
  count: number;
  albums: Array<{ titre: string; url: string; pochette?: string | null; type: string }>;
}

/** La discographie publique d'un artiste, lue sur sa page `/music`. */
export function bandcampArtist(url: string) {
  const p = new URLSearchParams({ url });
  return fetchJSON<BandcampDiscographie>(`${BASE}/ext/bandcamp/artist?${p}`);
}
