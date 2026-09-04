// Types mirroring tune-server Pydantic models

// Enums
// `bandcamp` est une source DISTANTE au même titre que `radio` : une URL déjà
// jouable, sans service authentifié derrière. Le serveur la résout par la même
// porte (`Orchestrator::resolve_direct_url`), et la file d'attente la range
// comme les autres pistes distantes.
export type Source = 'local' | 'tidal' | 'qobuz' | 'youtube' | 'amazon' | 'spotify' | 'deezer' | 'radio' | 'bandcamp';
// `dsf`/`dff` sont les formats réellement portés par les fichiers DSD : les
// omettre rendait le test de la puce « DSD » impossible selon le type (il ne
// passait que par le repli sur l'extension du chemin).
export type AudioFormat = 'flac' | 'wav' | 'mp3' | 'aac' | 'alac' | 'ogg' | 'opus' | 'dsd' | 'dsf' | 'dff' | 'aiff' | 'wma';
export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering';
export type RepeatMode = 'off' | 'one' | 'all';
// `openhome` et `airplay2` sont bien émis par le serveur (routes/zones.rs,
// discovery_setup.rs, outputs/airplay2) : les omettre faisait passer les gardes
// `output_type !== 'openhome'` / `!== 'airplay2'` pour impossibles, alors que
// les supprimer casserait ces sorties.
export type OutputType = 'local' | 'dlna' | 'openhome' | 'airplay' | 'airplay2' | 'chromecast' | 'bluos' | 'snapcast' | 'sonos' | 'squeezebox' | 'browser';

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
  added_at?: number | null;
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
  /** Dynamic Range lu dans les tags des fichiers, chiffres seuls (« 12 »).
   *  Servi uniquement par `GET /library/albums/{id}`, et absent de la réponse
   *  quand aucune piste ne porte le tag — ce qui est le cas courant. */
  dynamic_range?: string | null;
}

export interface Track {
  id: number | null;
  title: string;
  album_id?: number | null;
  album_title?: string | null;
  artist_id?: number | null;
  artist_name?: string | null;
  album_artist?: string | null;
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
  isrc?: string | null;
  bpm?: number | null;
  comments?: string | null;
  musicbrainz_recording_id?: string | null;
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
  /**
   * True when the delivered signal is lossless even if not bit-perfect, e.g. a
   * lossless source transcoded to another lossless container (DSD→FLAC,
   * ALAC→FLAC for a DLNA renderer). Falls back to bit_perfect on older servers
   * that don't send it. Used for the "Lossless/Lossy" loss label (#96).
   */
  lossless?: boolean;
  steps: SignalPathStep[];
  summary: string;
  decisions?: string[];
  checksum?: string | null;
  checksum_verified?: boolean | null;
}

/** Piste en lecture telle que le serveur la renvoie — ce n'est PAS un `Track`.
 *
 *  Le serveur sérialise sa structure `NowPlaying` (tune-core playback/mod.rs) :
 *  l'id de la piste s'y nomme `track_id`, et il n'y a **aucun id d'album ni
 *  d'artiste**. `GET /zones` sérialise la structure telle quelle, tandis que
 *  `/zones/{id}/state` construit son JSON à la main et renomme le champ en `id`
 *  (playback.rs) — d'où les deux noms ci-dessous.
 *
 *  Typer ce champ comme un `Track` laissait passer `current_track.id` et
 *  `current_track.album_id`, qui n'existent pas : les comparaisons étaient
 *  toujours fausses, en silence. Lire l'id via `track_id ?? id` — de
 *  préférence une seule fois, dans un dérivé du store, plutôt que dans chaque
 *  composant. */
export interface NowPlaying {
  /** Forme /zones (sérialisation directe de la structure serveur). */
  track_id?: number | null;
  /** Forme /zones/{id}/state (JSON construit à la main). */
  id?: number | null;
  title: string;
  artist_name?: string | null;
  album_title?: string | null;
  cover_path?: string | null;
  duration_ms?: number;
  source?: Source;
  source_id?: string | null;
  stream_id?: string | null;
  format?: AudioFormat | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  genre?: string | null;
  year?: number | null;
  /** L'album et l'artiste de la piste, par identifiant.
   *
   *  Ils manquaient côté serveur : le client devait deviner l'album depuis son
   *  titre, et cliquer sur « Entreat (2010) » atterrissait sur la page de
   *  The Cure (FabienM, v0.9.102). Absents pour une radio ou un flux, qui
   *  n'ont pas d'entrée en bibliothèque. */
  album_id?: number | null;
  artist_id?: number | null;
  /** Epoch ms (horloge serveur) du dernier changement titre/artiste — ancrage
   *  temporel des paroles radio. */
  metadata_changed_at?: number;
  /** Âge de cette métadonnée au moment de la réponse, calculé côté serveur
   *  (indépendant de l'horloge du client). */
  metadata_age_ms?: number;
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
  current_track?: NowPlaying | null;
  position_ms?: number;
  queue_length?: number;
  signal_path?: SignalPath | null;
  stereo_pair_id?: string | null;
  stereo_channel?: 'left' | 'right' | null;
  output_sent?: boolean;
  error?: string | null;
  stream_url?: string | null;
  online?: boolean;
  /**
   * Où va réellement le son de cette zone (#1499). `online` répond « la sortie
   * répond-elle ? », pas « y a-t-il une sortie ? », et vaut toujours `true`
   * pour une zone navigateur — même quand aucun onglet n'écoute.
   *
   * - `ok` — le son a une destination.
   * - `no_output` — aucune sortie associée : la lecture sera refusée.
   * - `browser_unattended` — zone navigateur qui joue depuis plus de douze
   *   secondes sans qu'un seul octet ait été tiré : personne n'écoute.
   *
   * Absent des serveurs < 0.9.70 : traiter l'absence comme `ok`.
   */
  output_reach?: 'ok' | 'no_output' | 'browser_unattended';
  /** Seconds since recovery started (null = not recovering) */
  recovery_started_at?: number | null;
  /** Number of consecutive failed poll attempts during recovery */
  recovery_attempts?: number;
  /** Whether this zone is the server-side default */
  is_default?: boolean;
  /** DSD playback mode: auto, native, dop, pcm */
  dsd_mode?: string;
  /** Décalage des paroles synchronisées, en ms. Positif = paroles retardées,
   *  pour compenser la latence serveur → oreille propre à l'appareil (#1328). */
  lyrics_offset_ms?: number;
  dlna_native_flac?: boolean;
  /** Plafond de fréquence d'échantillonnage de la zone (null = pas de limite). */
  max_sample_rate?: number | null;
  /** Volume fixe (bit-perfect) : signal à 100 %, épinglé — il survit au
   *  redémarrage du serveur, là où un 100 % ordinaire est rabaissé à 20 %
   *  par le garde-fou anti-réveil (tune-server-rust#1616). */
  fixed_volume?: boolean;
  /** Envoi de l'ALAC tel quel au renderer, sans transcodage. */
  alac_passthrough?: boolean;
  /** Envoyer l'AAC tel quel au renderer au lieu de le transcoder en FLAC.
   *  Marco Polo (#1424) : un Marantz SR7009 ou un Denon RC12 le decodent
   *  nativement, et la source etant deja compressee avec perte, le
   *  transcodage n'apporte aucune qualite — il retarde le premier son. */
  aac_passthrough?: boolean;
  /**
   * AutoPlay : le serveur ajoute des morceaux similaires a la fin de la file.
   * Porte par la ZONE, en base — c'est ce que lit le poller. Desactive par
   * defaut (migration 46), donc explicitement optionnel.
   */
  autoplay_enabled?: boolean;
  dlna_lpcm?: boolean;
  dlna_cap_16bit?: boolean;
  dlna_wav24?: boolean;
  /** Per-zone SetAVTransportURI→Play delay in ms (0 = config default). */
  dlna_play_delay_ms?: number;
  /** La zone s'annonce en MediaRenderer UPnP (pilotable par JPlay & co).
   *  Opt-in, défaut off. */
  upnp_renderer?: boolean;
  /** Trim de gain du renderer en dB (±12), appliqué au volume envoyé au
   *  device uniquement — l'affichage garde le volume utilisateur. 0 = neutre.
   *  Sans effet sur une zone fixed_volume. */
  gain_trim_db?: number;
  /**
   * Sortie mono (#2362) : le serveur somme `M = (L + R) / 2` et émet `M` sur
   * les DEUX voies de la zone.
   *
   * C'est un réglage de CÂBLAGE, pas d'agrément. Pour qui n'a qu'une enceinte
   * raccordée sur un canal, la moitié de la musique est aujourd'hui inaudible
   * — Nicolas Tardif, fil forum 1532 : « je perds toute la musique qui passe
   * par le canal droit ». Il n'est donc pas derrière la barrière Premium.
   *
   * ⚠️ N'agit que sur une sortie **locale** : le serveur persiste le réglage
   * sur n'importe quelle zone, mais la chaîne DSP qui l'applique n'existe
   * qu'en local. Ce que le signal subit RÉELLEMENT est dit par `signal_path`,
   * qui applique en plus la règle PURE — ne jamais déduire l'un de l'autre.
   *
   * Rendu par `GET /zones` **et** `GET /zones/{id}` (mesuré sur .18 : la clé
   * est présente à `false` sur les 18 zones). Défaut off.
   */
  mono_downmix?: boolean;
  /** Marque choisie par l'utilisateur au catalogue (override). null si non défini. */
  brand?: string | null;
  /** Modèle choisi par l'utilisateur (override). null si non défini. */
  model?: string | null;
  /** Marque détectée en UPnP pour le device assigné (pré-remplissage). */
  /** Le serveur cherche encore une URL jouable (extraction YouTube longue). */
  resolving?: boolean;
  /**
   * La zone sert un flux DoP en ce moment — donc **le curseur de volume est
   * sans effet**.
   *
   * Le serveur épingle le volume à l'unité tant que dure le DoP : tout autre
   * facteur réécrirait le marqueur du flux, le DAC quitterait le mode DSD et se
   * couperait. C'est lui qui neutralise volume, ReplayGain et égaliseur — il n'y
   * a plus rien à demander à l'utilisateur.
   *
   * ⚠️ Ce n'est PAS `dsd_mode`. Celui-ci dit ce qui a été *demandé* ; le serveur
   * le détecte sur les octets qui partent réellement, et le plafond
   * « Fréquence max » peut faire retomber en PCM sans rien annoncer. Ne jamais
   * déduire l'un de l'autre.
   *
   * Absent des serveurs antérieurs à la 0.9.91 : `undefined` y vaut « on ne
   * sait pas », et l'interface ne doit alors rien affirmer.
   */
  dop_active?: boolean;
  detected_manufacturer?: string | null;
  /** Modèle détecté en UPnP pour le device assigné (pré-remplissage). */
  detected_model?: string | null;
}

// Catalogue d'appareils (GET /devices/catalog)
export interface DeviceQuirks {
  dlna_no_extra_headers?: boolean;
  max_sample_rate?: number | null;
  force_mime?: string | null;
  force_16bit?: boolean;
  no_gapless?: boolean;
  pcm_only?: boolean;
  dlna_wav24?: boolean;
  dlna_native_flac?: boolean;
  dlna_play_delay_ms?: number | null;
}
export interface DeviceModel {
  name: string;
  quirks?: DeviceQuirks;
}
export interface DeviceBrand {
  name: string;
  models: DeviceModel[];
}
export interface DeviceCatalog {
  version: number;
  brands: DeviceBrand[];
}

/** Result of the DLNA renderer discovery check (GetProtocolInfo Sink). */
export interface RendererCapabilities {
  /** false when the Sink couldn't be read (offline/timeout) — the rest is then meaningless. */
  probed: boolean;
  flac?: boolean;
  wav?: boolean;
  /** 16-bit LPCM (audio/L16) — the standard DLNA WAV profile. */
  lpcm16?: boolean;
  /** 24-bit LPCM (audio/L24) — gates the "WAV 24-bit" override. */
  lpcm24?: boolean;
  alac?: boolean;
  aac?: boolean;
  mp3?: boolean;
  dsd?: boolean;
  sink?: string[];
  /** Present when probed === false. */
  reason?: string;
  message?: string;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  type: OutputType;
  host: string;
  port: number;
  available?: boolean;
  capabilities?: Record<string, any>;
  /** Marque : description UPnP/mDNS, sinon dérivée de l'OUI de la MAC. */
  manufacturer?: string | null;
  model?: string | null;
  mac_address?: string | null;
}

export interface LocalAudioDevice {
  /**
   * Identifiant de registre, `local:<nom>` — celui qu'attend `output_device_id`
   * à la création d'une zone.
   *
   * Le serveur ne le publie que depuis la 0.9.82 (tune-server-rust#1823) ;
   * `getAudioDevices()` le reconstruit sinon, de sorte que cette promesse en
   * soit une. Elle n'en était pas une avant : le champ était déclaré ici et
   * absent de la charge utile, donc toujours `undefined`. De là sont venues
   * des zones créées avec le nom du périphérique — que rien ne pouvait jouer —
   * et des identifiants `audio:undefined` dans les favoris et les appareils
   * masqués.
   */
  id: string;
  name: string;
  /**
   * Nombre maximal de canaux. Clé serveur : `max_channels`.
   *
   * ⚠️ Ce champ s'appelait `channels` ici, et ce nom n'a JAMAIS existé dans la
   * charge utile (#2098) — exactement le piège décrit ci-dessus pour `id`,
   * resté dans la même interface sans que personne le voie. Le serveur
   * sérialise `struct AudioDevice` sans aucun `rename` : les clés sont
   * `max_channels` et `sample_rates`, sans exception.
   *
   * Déclaré non optionnel, TypeScript ne pouvait rien signaler : c'était une
   * promesse que la charge utile ne tenait pas.
   */
  max_channels: number;
  /**
   * Fréquences d'échantillonnage supportées, en Hz. Clé serveur :
   * `sample_rates`.
   *
   * Une LISTE, pas une valeur courante — un périphérique ne joue pas, c'est
   * une zone qui joue. Passer par `etiquetteCaracteristiques()` pour l'afficher
   * plutôt que d'en prendre un élément au hasard.
   */
  sample_rates: number[];
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
  /**
   * Playlists du CATALOGUE du service — celles que la recherche fait remonter,
   * pas celles que possède l'utilisateur (`StreamingPlaylist`, qui porte en
   * plus `duration_ms` et `source`). Optionnel : un serveur antérieur à la
   * 0.9.71 ne renvoie pas le champ.
   */
  playlists?: CataloguePlaylist[];
}

/** Miroir exact de `StreamPlaylist` côté serveur : `id` y est sérialisé en
 *  `source_id`. Le service d'origine n'est pas dans l'objet — c'est la clé de
 *  `FederatedSearchResult.services` qui le porte. */
export interface CataloguePlaylist {
  source_id: string;
  name: string;
  description?: string | null;
  cover_path?: string | null;
  track_count: number;
  owner?: string | null;
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
  /** Account name. The server sends it even once a session has expired. */
  username?: string | null;
  subscription?: string | null;
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

/** Réglage booléen tel que /system/config peut réellement le renvoyer.
 *
 *  Ce n'est pas un excès de prudence : le serveur lit les réglages stockés en
 *  base sous forme de **texte** et leur applique un JSON.parse, avec repli sur
 *  la chaîne brute si l'analyse échoue (routes/system/config.rs). Selon ce qui a
 *  été écrit, un même drapeau ressort donc en `false`, en `"false"`, en `0` ou
 *  en `"0"` — ce contre quoi les vues se protègent déjà, à juste titre. Le typer
 *  `boolean` faisait passer ces gardes pour du code mort. */
export type ConfigFlag = boolean | string | number;

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
  enrich_on_scan: ConfigFlag;
  /**
   * Le mode PURE (audiophile) impose-t-il le volume à 100 % et gèle-t-il le
   * curseur ? Inactif par défaut — cocher « Audiophile » ne doit pas changer
   * le niveau sans prévenir.
   */
  audiophile_lock_volume?: ConfigFlag;
  /**
   * Fabrique une playlist à partir d'un DOSSIER dont les pistes viennent de
   * plusieurs albums — opt-in, inactif par défaut.
   */
  scan_folder_playlists?: ConfigFlag;
  /**
   * Import des fichiers .m3u/.pls rencontrés au scan — actif par défaut, car
   * il l'a toujours été. Distinct de `scan_folder_playlists` ci-dessus : celui-ci
   * lit des fichiers de playlist, l'autre déduit une playlist d'un dossier.
   */
  scan_import_playlists?: ConfigFlag;
  /** Paroles en ligne (LRCLIB, base communautaire) — désactivé par défaut. */
  lyrics_lrclib_enabled?: ConfigFlag;
  discogs_token_set: boolean;
  /** Sépare les dossiers de destination par qualité audio (réglage de scan). */
  quality_split?: ConfigFlag;
  // Appliance mode (Tune OS image): unlocks the host network settings UI
  appliance?: boolean;
  // Access URLs from another device (IP + .local) — shown in Settings
  server_urls?: string[];
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

/** Filtre de la vue Métadonnées.
 *
 *  Déclaré ici parce qu'il était écrit deux fois — en ligne dans MetadataView et
 *  comme type local dans MetadataStatsDashboard — et que les deux copies avaient
 *  divergé : `no_artist_cover` existe côté vue (bouton et branche de rendu) mais
 *  manquait au type du composant enfant, qui reçoit pourtant cette valeur. */
export type MetadataFilter =
  | 'all' | 'no_cover' | 'no_genre' | 'no_year' | 'no_artist'
  | 'no_artist_cover' | 'unknown' | 'duplicates' | 'doubtful';

export interface CompletenessStats {
  total_albums: number;
  albums_without_cover: number;
  albums_without_genre: number;
  albums_without_year: number;
  total_artists: number;
  artists_without_image: number;
  total_tracks: number;
  tracks_without_artist: number;
  /** Album-level "missing artist" so the dashboard's Artist card shares the
   *  total_albums denominator with Cover/Genre/Year. Optional for older servers
   *  that only send tracks_without_artist. */
  albums_without_artist?: number;
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
  /** Whether the configured directory still exists on disk. A stale root
   *  (renamed/unmounted share) is `false` and should be flagged in the UI.
   *  Optional for backward-compat with older servers that omit it. */
  exists?: boolean;
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
  /** `false` quand le dossier n'a pas pu être ouvert (lecteur réseau non
   *  monté, permissions). Sans ce champ le client affichait « aucune piste »
   *  pour un dossier injoignable — le faux diagnostic « ma musique a disparu »
   *  (#1190). Optionnel : les serveurs antérieurs ne l'envoient pas. */
  accessible?: boolean;
  /** Raison système de l'échec, quand `accessible` vaut `false`. */
  access_error?: string | null;
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
  /** `dc:creator` / `upnp:artist` du conteneur — l'artiste d'un album. */
  artist?: string | null;
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

/** Ce que rend `/network/media-servers/{id}/search`.
 *
 *  `supported` dit si le SERVEUR DISTANT sait chercher : sans `dc:title` dans
 *  ses `SearchCapabilities`, on ne lui envoie pas de critère qu'il ne sait pas
 *  évaluer — beaucoup répondent alors par toute leur bibliothèque, ce qui
 *  ressemble à un résultat et n'en est pas. Le client se rabat sur un filtrage
 *  du dossier affiché, et le dit. */
export interface MediaServerSearchResult extends Omit<MediaServerBrowseResult, 'object_id'> {
  container: string;
  query: string;
  supported: boolean;
  reason: string;
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
  // Server returns {"albums": [...], "total": albums.len()} — total is the
  // length of the returned list, i.e. capped by max_limit when one is sent.
  total: number;
  albums: any[];  // shape == albums table row
}
