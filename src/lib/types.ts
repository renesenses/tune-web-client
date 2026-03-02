// Types mirroring tune-server Pydantic models

// Enums
export type Source = 'local' | 'tidal' | 'qobuz' | 'youtube' | 'amazon' | 'spotify' | 'radio';
export type AudioFormat = 'flac' | 'wav' | 'mp3' | 'aac' | 'alac' | 'ogg' | 'opus' | 'dsd' | 'aiff' | 'wma';
export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering';
export type RepeatMode = 'off' | 'one' | 'all';
export type OutputType = 'local' | 'dlna' | 'airplay';

// Core domain models
export interface Artist {
  id: number | null;
  name: string;
  sort_name?: string | null;
  musicbrainz_id?: string | null;
  discogs_id?: string | null;
  bio?: string | null;
  image_path?: string | null;
}

export interface Album {
  id: number | null;
  title: string;
  artist_id?: number | null;
  artist_name?: string | null;
  year?: number | null;
  genre?: string | null;
  disc_count?: number;
  track_count?: number;
  cover_path?: string | null;
  source?: Source;
  source_id?: string | null;
}

export interface Track {
  id: number | null;
  title: string;
  album_id?: number | null;
  album_title?: string | null;
  artist_id?: number | null;
  artist_name?: string | null;
  disc_number?: number;
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

export interface Zone {
  id: number | null;
  name: string;
  output_type?: OutputType;
  output_device_id?: string | null;
  volume?: number;
  group_id?: string | null;
  state?: PlaybackState;
  current_track?: Track | null;
  position_ms?: number;
  queue_length?: number;
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

export interface StreamingServiceStatus {
  enabled: boolean;
  authenticated: boolean;
}

export interface StreamingAuthResponse {
  authenticated: boolean;
  verification_url?: string | null;
}

export interface SystemHealth {
  status: string;
  components: Record<string, boolean>;
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
}

export interface SystemStats {
  tracks: number;
  albums: number;
  artists: number;
  zones: number;
  devices: number;
}

export interface ZoneGroupResponse {
  group_id: string;
  leader_id: number;
  zone_ids: number[];
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

export interface WSEvent {
  type: string;
  data: any;
  source?: string;
}
