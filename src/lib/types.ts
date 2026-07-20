// Types mirroring tune-server Pydantic models

// Enums
export type Source = 'local' | 'tidal' | 'qobuz' | 'youtube' | 'amazon' | 'spotify' | 'deezer' | 'radio';
export type AudioFormat = 'flac' | 'wav' | 'mp3' | 'aac' | 'alac' | 'ogg' | 'opus' | 'dsd' | 'aiff' | 'wma';
export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering';
export type RepeatMode = 'off' | 'one' | 'all';
export type OutputType = 'local' | 'dlna' | 'airplay' | 'chromecast' | 'bluos' | 'snapcast' | 'sonos' | 'squeezebox' | 'browser';

// v0.8.0 multi-room — Snapcast endpoint discovered by snapserver.
export interface SnapcastClient {
  id: string;        // UUID assigned by snapserver
  name: string;
  host: string;
  mac: string | null;
  connected: boolean;
  volume: number;    // 0–100
}

// v0.8.0 multi-room — Sonos S2 speaker discovered by SoCo.
export interface SonosSpeaker {
  uid: string;             // RINCON_xxx
  name: string;
  ip: string;
  is_coordinator: boolean;
  group_uid: string | null;
}

// v0.8.0 multi-room — calibrated inter-techno offset, pair canonicalised
// alphabetically server-side.
export interface GroupDelay {
  tech_a: string;
  tech_b: string;
  delay_ms: number;
  calibrated_at?: string;
}

// Core domain models
export interface Artist {
  id: number | null;
  name: string;
  sort_name?: string | null;
  musicbrainz_id?: string | null;
  discogs_id?: string | null;
  bio?: string | null;
  image_path?: string | null;
  image_source?: string | null;
  source_id?: string | null;
}

export interface Album {
  id: number | null;
  title: string;
  artist_id?: number | null;
  artist_name?: string | null;
  year?: number | null;
  original_year?: number | null;
  release_date?: string | null;
  original_date?: string | null;
  genre?: string | null;
  disc_count?: number;
  track_count?: number;
  cover_path?: string | null;
  source?: Source;
  source_id?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  format?: string | null;
  quality?: string | null;
  label?: string | null;
  catalog_number?: string | null;
}

export interface Track {
  id: number | null;
  title: string;
  album_id?: number | null;
  album_title?: string | null;
  artist_id?: number | null;
  artist_name?: string | null;
  disc_number?: number;
  disc_subtitle?: string | null;
  track_number?: number;
  duration_ms?: number;
  file_path?: string | null;
  format?: AudioFormat | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  channels?: number;
  cover_path?: string | null;
  source?: Source;
  source_id?: string | null;
  gapless_next?: boolean;
  // Metadata fields returned by server (absent from legacy Track payloads, so optional)
  genre?: string | null;
  year?: number | null;
  label?: string | null;
  composer?: string | null;
}

export interface Playlist {
  id: number | null;
  name: string;
  description?: string | null;
  track_count?: number;
}

export interface QueueItem {
  id: number | null;
  zone_id: number;
  track_id: number;
  position: number;
  track?: Track | null;
}

export interface SignalPathStep {
  /**
   * Stage name as emitted by the server: 'Source', 'Decoder', 'Transcoder',
   * 'Resampler', 'Volume', 'DSP', 'Transport', 'Renderer'.
   * NOTE: the server sends `name`, not `stage` — reading `stage` yielded
   * `undefined` for every step, which broke per-step icon selection and hid
   * the format detail (forum #1127).
   */
  name: string;
  /** Human-readable line, already carries the format, e.g. "FLAC 44kHz/16bit". */
  description: string;
  bit_perfect?: boolean;
  detail?: string | null;
}

export interface SignalPath {
  bit_perfect: boolean;
  /** Whether the *source* format is lossless (distinct from bit_perfect). */
  lossless?: boolean;
  steps: SignalPathStep[];
  summary: string;
  decisions?: string[];
  checksum?: string | null;
  checksum_verified?: boolean | null;
}

export interface Zone {
  id: number | null;
  name: string;
  output_type?: OutputType;
  output_device_id?: string | null;
  volume?: number;
  group_id?: string | null;
  sync_delay_ms?: number;
  state?: PlaybackState;
  current_track?: Track | null;
  position_ms?: number;
  queue_length?: number;
  queue_position?: number;
  signal_path?: SignalPath | null;
  stereo_pair_id?: string | null;
  stereo_channel?: 'left' | 'right' | null;
  output_sent?: boolean;
  error?: string | null;
  stream_url?: string | null;
  online?: boolean;
  /** Seconds since recovery started (null = not recovering) */
  recovery_started_at?: number | null;
  /** Number of consecutive failed poll attempts during recovery */
  recovery_attempts?: number;
  /** Whether this zone is the server-side default */
  is_default?: boolean;
  /** DSD playback mode: auto, native, dop, pcm */
  dsd_mode?: string;
  dlna_native_flac?: boolean;
  alac_passthrough?: boolean;
  dlna_lpcm?: boolean;
  /** Max output sample rate (Hz); null/absent = no limit (resample only above it) */
  max_sample_rate?: number | null;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  type: OutputType;
  host: string;
  port: number;
  available?: boolean;
  capabilities?: Record<string, any>;
}

export interface LocalAudioDevice {
  id: string;
  name: string;
  channels: number;
  sample_rate: number;
  is_default?: boolean;
}

// Request/Response models
export interface QueueStateResponse {
  tracks: Track[];
  position: number;
  length: number;
}

export interface SearchResult {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

export interface FederatedSearchResult {
  local: SearchResult;
  services: Record<string, SearchResult>;
}

export interface FeaturedSection {
  id: string;
  name: string;
}

export interface StreamingGenre {
  id: string;
  name: string;
  has_children: boolean;
  image_url?: string | null;
}

export interface StreamingServiceStatus {
  enabled: boolean;
  authenticated: boolean;
}

export interface StreamingAuthResponse {
  authenticated: boolean;
  verification_url?: string | null;
  user_code?: string | null;
}

export interface SystemHealth {
  status: string;
  // Server /system/health does not currently send a components map; keep optional
  // so the Diagnostics view degrades gracefully instead of crashing on render.
  components?: Record<string, boolean>;
}

export interface SystemConfig {
  music_dirs: string[];
  api_port: number;
  stream_port: number;
  tidal_enabled: boolean;
  qobuz_enabled: boolean;
  youtube_enabled: boolean;
  amazon_music_enabled: boolean;
  discovery_enabled: boolean;
  zone_auto_create?: boolean;
  metadata_readonly: boolean;
  enrich_on_scan: boolean;
  discogs_token_set: boolean;
  // Database
  db_engine: string;
  db_path?: string | null;
  db_pool_min?: number | null;
  db_pool_max?: number | null;
  db_connected: boolean;
  // Squeezebox / LMS
  squeezebox_enabled?: boolean;
  lms_host?: string | null;
}

export interface SystemStats {
  tracks: number;
  albums: number;
  artists: number;
  zones: number;
  devices: number;
}

export interface AudioCheckIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface AudioCheckResult {
  zones: number;
  zones_with_output: number;
  local_outputs: { id: number; name: string; channels: number; default: boolean }[];
  network_renderers: { id: string; name: string; type: string }[];
  has_audio: boolean;
  issues: AudioCheckIssue[];
}

export interface ZoneGroupResponse {
  group_id: string;
  leader_id: number;
  zone_ids: number[];
  auto_synced: boolean;
  group_manufacturer: string;
}

export interface CompletenessStats {
  total_albums: number;
  albums_without_cover: number;
  albums_without_genre: number;
  albums_without_year: number;
  total_artists: number;
  artists_without_image: number;
  total_tracks: number;
  tracks_without_artist: number;
  doubtful_count: number;
}

export interface ArtworkRescanResult {
  status: 'found' | 'not_found';
  cover_path: string | null;
}

export interface BrowseRootEntry {
  name: string;
  path: string;
  track_count: number;
}

export interface BrowseRootsResponse {
  roots: BrowseRootEntry[];
}

export interface BrowseDirectory {
  name: string;
  path: string;
  track_count: number;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  music_root: string;
  directories: BrowseDirectory[];
  tracks: Track[];
}

// Media Server (UPnP/DLNA) models
export interface MediaServer {
  id: string;
  name: string;
  host: string;
  port: number;
  manufacturer: string;
  model: string;
  available: boolean;
}

export interface MediaServerContainer {
  id: string;
  parent_id: string;
  title: string;
  child_count: number;
  album_art_uri?: string | null;
}

export interface MediaServerItem {
  id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  res_url?: string | null;
  duration_ms?: number | null;
  album_art_uri?: string | null;
}

export interface MediaServerBrowseResult {
  object_id: string;
  containers: MediaServerContainer[];
  items: MediaServerItem[];
  total_matches: number;
  number_returned: number;
}

export interface StreamingPlaylist {
  source_id: string;
  name: string;
  description?: string | null;
  track_count: number;
  duration_ms: number;
  cover_path?: string | null;
  source: Source;
}

export interface BackupInfo {
  filename: string;
  size: number;
  created_at: string;
}

// User tags
export interface UserTag {
  id: number | null;
  name: string;
  color: string;
  count?: number;
}

export interface RadioStation {
  id: number | null;
  name: string;
  stream_url: string;
  logo_url?: string | null;
  genre?: string | null;
  tags?: string | null;
  codec?: string | null;
  country?: string | null;
  homepage_url?: string | null;
  favorite: boolean;
}

export interface RadioImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface StreamingTrackInfo {
  source: Source;
  source_id: string;
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  duration_ms?: number;
  format?: AudioFormat | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  channels?: number;
  cover_path?: string | null;
}

// Unified playlist manager
export interface UnifiedPlaylistsResponse {
  local: Playlist[];
  services: Record<string, StreamingPlaylist[]>;
}

export interface PlaylistImportResponse {
  playlist_id: number;
  name: string;
  tracks_imported: number;
}

export interface TransferAlternative {
  title: string;
  artist_name: string;
  source_id: string;
  score: number;
}

export interface TransferTrackResult {
  title: string;
  artist_name?: string | null;
  status: 'matched' | 'not_found' | 'approximate';
  source_id?: string | null;
  target_id?: string | null;
  target_service?: string | null;
  target_title?: string | null;
  target_artist?: string | null;
  score?: number;
  match_method?: string;
  alternatives?: TransferAlternative[];
}

export interface PlaylistTransferResponse {
  playlist_id: number | string | null;
  playlist_name: string;
  total_tracks: number;
  matched: number;
  not_found: number;
  approximate: number;
  tracks: TransferTrackResult[];
  local_playlist_id?: number | null;
  target_service?: string;
}

export interface DiffTrackResult {
  title: string;
  artist_name?: string | null;
  in_source: boolean;
  in_target: boolean;
  match_quality?: 'exact' | 'approximate' | null;
}

export interface PlaylistDiffResponse {
  source_name: string;
  target_name: string;
  only_in_source: DiffTrackResult[];
  only_in_target: DiffTrackResult[];
  in_both: DiffTrackResult[];
}

export interface RecoverTrackResult {
  track_id: number;
  title: string;
  artist_name?: string | null;
  status: 'available' | 'unavailable' | 'recovered';
  original_source: string;
  alternatives: Array<{
    service: string;
    source_id: string;
    title: string;
    artist_name?: string | null;
    quality: string;
  }>;
}

export interface PlaylistRecoverResponse {
  playlist_name: string;
  total_tracks: number;
  available: number;
  unavailable: number;
  recovered: number;
  tracks: RecoverTrackResult[];
}

export interface RecoverApplyResponse {
  replaced: number;
  failed: number;
}

export interface StereoPairResponse {
  stereo_pair_id: string;
  left_zone_id: number;
  right_zone_id: number;
}

export interface StereoPairInfo {
  stereo_pair_id: string;
  left_zone: Zone | null;
  right_zone: Zone | null;
}

export interface TrackCredit {
  id: number | null;
  track_id: number;
  artist_id: number | null;
  artist_name: string;
  role: string;
  instrument: string | null;
  position: number;
}

export interface HistoryEntry {
  track_title: string;
  artist_name: string | null;
  album_title: string | null;
  cover_path: string | null;
  played_at: string;
  source: string | null;
  duration_ms: number | null;
  listened_ms: number | null;
}

export interface TopTrack {
  title: string;
  artist_name: string | null;
  album_title: string | null;
  cover_path: string | null;
  track_id: number | null;
  source: string | null;
  plays: number;
}

export interface TopArtist {
  name: string;
  artist_name?: string;
  plays: number;
  play_count?: number;
  artist_id?: number | null;
  id?: number | null;
}

export interface ArtistMetadata {
  bio?: string;
  bio_fr?: string;
  bio_en?: string;
  anecdotes?: string[];
  similar_artists?: { name: string; reason: string }[];
  members?: { name: string; role: string }[];
  discography_highlights?: { title: string; year: number; description: string }[];
  image_url?: string;
  enrichment_status?: string;
}

export interface WSEvent {
  type: string;
  data: any;
  source?: string;
}

// v0.8.0 — Smart Collections (rule-based album collections).
//
// `field` is one of the whitelisted album columns or a cross-table
// virtual: 'credit', 'play_count', 'last_played_at'.
// `op` depends on the field type — see server compiler for the
// authoritative list.
export interface SmartRule {
  field: string;
  op: string;
  value: any;
}

export interface SmartCollection {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  rules: string;            // JSON-encoded SmartRule[]
  match_mode: 'all' | 'any';
  sort_by: string;
  sort_order: 'asc' | 'desc';
  max_albums: number;
  auto_refresh: number;
  album_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SmartCollectionPreview {
  count: number;
  albums: any[];  // shape == albums table row
}
