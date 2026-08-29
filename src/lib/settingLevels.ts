/**
 * Niveaux d'affichage des réglages (tune-server-rust#1617).
 *
 * Trois niveaux — débutant, intermédiaire, expert — et un registre central qui
 * annote chaque réglage de SettingsView d'un niveau minimal. L'UI ne montre
 * que les réglages dont le niveau est ≤ au niveau choisi par l'utilisateur.
 *
 * Règle d'or : un réglage dont la valeur diffère de son défaut reste TOUJOURS
 * visible, quel que soit le niveau d'affichage. On ne cache jamais à
 * l'utilisateur un levier qu'il a déjà actionné (`isSettingVisible`).
 *
 * Le niveau choisi vit dans les préférences UI synchronisées
 * (`preferences.ts` → `ui_preferences`), défaut : débutant pour TOUS —
 * installations existantes comprises (arbitrage Bertrand, 14/08). Seule
 * exception : l'ancien toggle « Afficher les réglages avancés »
 * (localStorage `tune_settings_advanced`) est absorbé — s'il était actif,
 * le premier chargement migre vers le niveau expert (`legacyAdvancedToLevel`).
 */

export type SettingsLevel = 'beginner' | 'intermediate' | 'expert';

/** Ordre croissant des niveaux — l'index sert de rang de comparaison. */
export const SETTINGS_LEVELS: readonly SettingsLevel[] = ['beginner', 'intermediate', 'expert'];

/** Onglets de SettingsView couverts par le registre (l'onglet CLAP, créé après
 *  l'inventaire du ticket, n'est pas filtré au lot 1). */
export type SettingsTab = 'general' | 'library' | 'services' | 'network' | 'system';

export interface SettingLevelEntry {
  tab: SettingsTab;
  level: SettingsLevel;
  /** Sous-réglage : uniquement atteignable via son parent (ex. durée du
   *  crossfade, hôte LMS). Exclu du compteur « n réglages masqués » — il ne
   *  se rend de toute façon pas tant que le parent n'est pas activé. */
  sub?: true;
}

/**
 * Registre central : clé de réglage → { onglet, niveau }.
 *
 * Les niveaux viennent de l'inventaire du ticket #1617 ; les clés suivent
 * l'implantation RÉELLE des blocs dans SettingsView (certains réglages que le
 * ticket rangeait dans « Réseau & Audio » vivent aujourd'hui dans l'onglet
 * Services : par-zone, Squeezebox, HQPlayer…).
 */
export const SETTING_LEVELS = {
  // ── Général ──────────────────────────────────────────────────────────
  'general.theme': { tab: 'general', level: 'beginner' },
  'general.language': { tab: 'general', level: 'beginner' },
  'general.startupView': { tab: 'general', level: 'beginner' },
  'general.defaultZone': { tab: 'general', level: 'beginner' },
  'general.tooltips': { tab: 'general', level: 'beginner' },
  'general.streamingQuality': { tab: 'general', level: 'beginner' },
  'general.loopByDefault': { tab: 'general', level: 'beginner' },
  'general.lockVolume': { tab: 'general', level: 'intermediate' },
  'general.crossfade': { tab: 'general', level: 'intermediate' },
  'general.crossfadeDuration': { tab: 'general', level: 'intermediate', sub: true },
  'general.volumeDisplay': { tab: 'general', level: 'intermediate' },
  'general.voiceCommand': { tab: 'general', level: 'intermediate' },

  // ── Bibliothèque ─────────────────────────────────────────────────────
  'library.musicDirs': { tab: 'library', level: 'beginner' },
  'library.scanLibrary': { tab: 'library', level: 'beginner' },
  'library.searchCovers': { tab: 'library', level: 'beginner' },
  'library.fullScan': { tab: 'library', level: 'intermediate' },
  'library.folderPlaylists': { tab: 'library', level: 'intermediate' },
  'library.importPlaylistFiles': { tab: 'library', level: 'intermediate' },
  'library.qualitySplit': { tab: 'library', level: 'intermediate' },
  'library.scanSchedule': { tab: 'library', level: 'intermediate' },
  'library.scanScheduleTime': { tab: 'library', level: 'intermediate', sub: true },
  'library.enrichOnScan': { tab: 'library', level: 'intermediate' },
  'library.lyricsLrclib': { tab: 'library', level: 'intermediate' },
  'library.replaygainAnalysis': { tab: 'library', level: 'intermediate' },
  'library.oxygenEnable': { tab: 'library', level: 'intermediate' },
  'library.oxygenView': { tab: 'library', level: 'intermediate' },
  'library.batchEnrich': { tab: 'library', level: 'intermediate' },
  'library.enrichArtwork': { tab: 'library', level: 'intermediate' },
  'library.clearLibrary': { tab: 'library', level: 'expert' },
  'library.metadataReadonly': { tab: 'library', level: 'expert' },
  'library.ingestMode': { tab: 'library', level: 'expert' },
  'library.ingestConflict': { tab: 'library', level: 'expert' },
  'library.ingestDestRoot': { tab: 'library', level: 'expert' },
  'library.ingestTemplate': { tab: 'library', level: 'expert' },
  'library.ingestWriteTags': { tab: 'library', level: 'expert' },
  'library.oxygenFacets': { tab: 'library', level: 'expert', sub: true },
  'library.oxygenFacetLimit': { tab: 'library', level: 'expert', sub: true },
  'library.discogsToken': { tab: 'library', level: 'expert' },
  'library.writeTags': { tab: 'library', level: 'expert' },
  'library.metadataFields': { tab: 'library', level: 'expert' },

  // ── Services ─────────────────────────────────────────────────────────
  'services.streamingServices': { tab: 'services', level: 'beginner' },
  'services.tokensBridge': { tab: 'services', level: 'intermediate' },
  'services.youtubePlayback': { tab: 'services', level: 'intermediate' },
  'services.spotifyConnect': { tab: 'services', level: 'intermediate' },
  'services.zoneAutoCreate': { tab: 'services', level: 'intermediate' },
  'services.followMe': { tab: 'services', level: 'intermediate' },
  'services.perZoneLyricsOffset': { tab: 'services', level: 'intermediate' },
  'services.perZoneFixedVolume': { tab: 'services', level: 'intermediate' },
  'services.deezerArl': { tab: 'services', level: 'expert', sub: true },
  'services.perZoneDsdMode': { tab: 'services', level: 'expert' },
  'services.perZoneMaxSampleRate': { tab: 'services', level: 'expert' },
  'services.zoneAdvanced': { tab: 'services', level: 'expert' },
  'services.squeezebox': { tab: 'services', level: 'expert' },
  'services.hqplayer': { tab: 'services', level: 'expert' },

  // ── Réseau & Audio ───────────────────────────────────────────────────
  'network.audioDiagnostic': { tab: 'network', level: 'beginner' },
  'network.applianceWifi': { tab: 'network', level: 'beginner' },
  'network.createBrowserZone': { tab: 'network', level: 'beginner' },
  'network.tuneServers': { tab: 'network', level: 'intermediate' },
  'network.networkDevices': { tab: 'network', level: 'intermediate' },
  'network.replayGain': { tab: 'network', level: 'intermediate' },
  'network.wasapiMode': { tab: 'network', level: 'intermediate', sub: true },
  'network.eqBands': { tab: 'network', level: 'intermediate' },
  'network.tuneBridge': { tab: 'network', level: 'intermediate' },
  'network.multiroomOffsets': { tab: 'network', level: 'expert' },
  'network.audioBackend': { tab: 'network', level: 'expert' },
  'network.replayGainPreamp': { tab: 'network', level: 'expert', sub: true },
  'network.replayGainAntiClip': { tab: 'network', level: 'expert', sub: true },
  'network.dsdNetwork': { tab: 'network', level: 'expert' },

  // ── Système ──────────────────────────────────────────────────────────
  'system.accessFromDevice': { tab: 'system', level: 'beginner' },
  'system.serverUpdate': { tab: 'system', level: 'beginner' },
  'system.serverHealth': { tab: 'system', level: 'beginner' },
  'system.pushNotifications': { tab: 'system', level: 'beginner' },
  'system.cloudSso': { tab: 'system', level: 'beginner' },
  'system.premiumLicense': { tab: 'system', level: 'beginner' },
  'system.about': { tab: 'system', level: 'beginner' },
  'system.diagnostics': { tab: 'system', level: 'intermediate' },
  'system.telemetry': { tab: 'system', level: 'intermediate' },
  'system.communitySync': { tab: 'system', level: 'intermediate' },
  'system.browsePlugins': { tab: 'system', level: 'intermediate' },
  'system.dataLocation': { tab: 'system', level: 'expert' },
  'system.databaseInfo': { tab: 'system', level: 'expert' },
  'system.databaseExportImport': { tab: 'system', level: 'expert' },
  'system.searchReindex': { tab: 'system', level: 'expert' },
  'system.databaseMigration': { tab: 'system', level: 'expert' },
  'system.libraryImport': { tab: 'system', level: 'expert' },
  'system.configExportImport': { tab: 'system', level: 'expert' },
  'system.exportCsv': { tab: 'system', level: 'expert' },
  'system.logLevel': { tab: 'system', level: 'expert' },
  'system.apiDocs': { tab: 'system', level: 'expert' },
} as const satisfies Record<string, SettingLevelEntry>;

export type SettingKey = keyof typeof SETTING_LEVELS;

/** Rang de comparaison d'un niveau (débutant < intermédiaire < expert). */
export function levelRank(level: SettingsLevel): number {
  return SETTINGS_LEVELS.indexOf(level);
}

/**
 * Un réglage est visible si son niveau est ≤ au niveau d'affichage choisi —
 * OU si sa valeur diffère de son défaut (règle d'or) : un levier déjà
 * actionné ne disparaît jamais.
 */
export function isSettingVisible(
  settingLevel: SettingsLevel,
  userLevel: SettingsLevel,
  modified = false,
): boolean {
  return modified || levelRank(settingLevel) <= levelRank(userLevel);
}

/** Idem, par clé du registre. */
export function isKeyVisible(key: SettingKey, userLevel: SettingsLevel, modified = false): boolean {
  return isSettingVisible(SETTING_LEVELS[key].level, userLevel, modified);
}

/**
 * Nombre de réglages masqués par onglet au niveau donné, pour la ligne
 * « n réglages masqués — passez au niveau supérieur ».
 *
 * - les réglages modifiés ne comptent pas (ils restent visibles, règle d'or) ;
 * - les sous-réglages (`sub`) ne comptent pas (invisibles tant que leur
 *   parent n'est pas activé, quel que soit le niveau) ;
 * - `isPresent` permet d'exclure les blocs qui ne se rendent pas du tout
 *   (ex. « Emplacement des données » hors appliance, par-zone sans zone).
 */
export function hiddenCountByTab(
  userLevel: SettingsLevel,
  isModified: (key: SettingKey) => boolean = () => false,
  isPresent: (key: SettingKey) => boolean = () => true,
): Record<SettingsTab, number> {
  const counts: Record<SettingsTab, number> = {
    general: 0, library: 0, services: 0, network: 0, system: 0,
  };
  for (const key of Object.keys(SETTING_LEVELS) as SettingKey[]) {
    const entry: SettingLevelEntry = SETTING_LEVELS[key];
    if (entry.sub) continue;
    if (!isPresent(key)) continue;
    if (!isSettingVisible(entry.level, userLevel, isModified(key))) counts[entry.tab]++;
  }
  return counts;
}

/** Niveau immédiatement supérieur (expert reste expert). */
export function nextLevel(level: SettingsLevel): SettingsLevel {
  return SETTINGS_LEVELS[Math.min(levelRank(level) + 1, SETTINGS_LEVELS.length - 1)];
}

/** `true` si la valeur est un niveau valide. */
export function isSettingsLevel(v: unknown): v is SettingsLevel {
  return typeof v === 'string' && (SETTINGS_LEVELS as readonly string[]).includes(v);
}

/**
 * Migration de l'ancien toggle « Afficher les réglages avancés » (onglet
 * Système, clé localStorage `tune_settings_advanced`) : actif ⇒ expert,
 * sinon défaut débutant. Appelée UNIQUEMENT quand les préférences stockées
 * ne portent pas encore de niveau — un choix explicite fait toujours foi.
 */
export function legacyAdvancedToLevel(legacyFlag: string | null): SettingsLevel {
  return legacyFlag === '1' ? 'expert' : 'beginner';
}
