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
 * (`preferences.ts` → `ui_preferences`). Le DÉFAUT y est `expert` depuis le
 * 27/08 (Bertrand), ce qui a inversé l'arbitrage du 14/08 (« débutant pour
 * TOUS ») : hors choix explicite, plus rien n'est masqué. L'ancien toggle
 * « Afficher les réglages avancés » (localStorage `tune_settings_advanced`)
 * reste absorbé et prime sur ce défaut (`legacyAdvancedToLevel`).
 *
 * ⚠️ Conséquence à ne pas perdre de vue : le filtre ne mord que sur les
 * utilisateurs qui ont CHOISI débutant ou intermédiaire. C'est précisément
 * pour eux que rien ne doit disparaître sans laisser de trace — voir
 * `hiddenKeysByTab` et `revealLevel`.
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
   *  crossfade, hôte LMS). Tant que le parent est ÉTEINT il ne se rend pas du
   *  tout, et il est alors exclu du compteur « n réglages masqués » : il n'y
   *  a rien à révéler en montant de niveau. Dès que le parent est ALLUMÉ la
   *  ligne se rend — et si le niveau la masque, elle compte comme n'importe
   *  quelle autre (voir `hiddenKeysByTab`, argument `isParentOn`). */
  sub?: true;
  /** Réglage qui commande le rendu d'un sous-réglage. Déclaratif : c'est
   *  l'appelant qui sait si ce parent est allumé (`isParentOn`), le registre
   *  se contente de dire QUI est le parent.
   *
   *  Typé `string` et non `SettingKey` : `SettingKey` se déduit de
   *  `SETTING_LEVELS`, qui se contraint par cette interface — le typer
   *  strictement referme la boucle et TypeScript rend tout le registre `any`,
   *  ce qui ferait disparaître en silence la vérification des niveaux.
   *  Qu'un parent existe vraiment est tenu par une garde, pas par le
   *  compilateur (voir `niveauxTraceDesMasques1617.test.ts`). */
  parent?: string;
}

/**
 * Registre central : clé de réglage → { onglet, niveau }.
 *
 * Les niveaux viennent de l'inventaire du ticket #1617 ; les clés suivent
 * l'implantation RÉELLE des blocs dans SettingsView. Le préfixe de la clé et le
 * champ `tab` disent la même chose et doivent le rester : c'est `tab` qui
 * alimente le compteur « n réglages masqués » de l'onglet, et une clé qui ment
 * sur son onglet fait compter les réglages du mauvais côté. Les réglages
 * par-zone ont ainsi suivi leur bloc de « Services » vers « Réseau & Audio »
 * (#2171). Restent dans Services des blocs que l'inventaire #1617 rangeait
 * ailleurs : Squeezebox et HQPlayer, qui sont bien des serveurs extérieurs.
 */
export const SETTING_LEVELS = {
  // ── Général ──────────────────────────────────────────────────────────
  'general.theme': { tab: 'general', level: 'beginner' },
  'general.language': { tab: 'general', level: 'beginner' },
  'general.startupView': { tab: 'general', level: 'beginner' },
  'general.defaultZone': { tab: 'general', level: 'beginner' },
  'general.tooltips': { tab: 'general', level: 'beginner' },
  'general.loopByDefault': { tab: 'general', level: 'beginner' },
  'general.lockVolume': { tab: 'general', level: 'intermediate' },
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
  'library.scanScheduleTime': { tab: 'library', level: 'intermediate', sub: true, parent: 'library.scanSchedule' },
  'library.enrichOnScan': { tab: 'library', level: 'intermediate' },
  // Débutant, et non intermédiaire (arbitrage Bertrand, 30/08, #2859).
  //
  // La récupération en ligne est la SEULE source de paroles qu'un utilisateur
  // puisse obtenir sans poser lui-même un `.lrc` à côté de chaque morceau, et
  // le serveur la garde désactivée par défaut (`lyrics_lrclib_enabled`). Tant
  // que cette entrée valait `intermediate`, le seul interrupteur qui l'allume
  // était invisible au niveau par défaut : l'option existait, personne ne
  // pouvait l'atteindre sans savoir qu'il fallait d'abord changer de niveau
  // d'affichage. Pierre M l'a vécu comme une panne (fil forum 1617) — et une
  // fonction qu'on ne peut pas trouver ne se distingue pas d'une fonction
  // absente.
  'library.lyricsLrclib': { tab: 'library', level: 'beginner' },
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
  'library.oxygenFacets': { tab: 'library', level: 'expert', sub: true, parent: 'library.oxygenEnable' },
  'library.oxygenFacetLimit': { tab: 'library', level: 'expert', sub: true, parent: 'library.oxygenEnable' },
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
  'services.deezerArl': { tab: 'services', level: 'expert', sub: true, parent: 'services.streamingServices' },
  'services.squeezebox': { tab: 'services', level: 'expert' },
  'services.hqplayer': { tab: 'services', level: 'expert' },

  // ── Réseau & Audio ───────────────────────────────────────────────────
  'network.audioDiagnostic': { tab: 'network', level: 'beginner' },
  'network.applianceWifi': { tab: 'network', level: 'beginner' },
  'network.createBrowserZone': { tab: 'network', level: 'beginner' },
  'network.tuneServers': { tab: 'network', level: 'intermediate' },
  'network.networkDevices': { tab: 'network', level: 'intermediate' },
  'network.replayGain': { tab: 'network', level: 'intermediate' },
  'network.wasapiMode': { tab: 'network', level: 'intermediate', sub: true, parent: 'network.audioBackend' },
  'network.eqBands': { tab: 'network', level: 'intermediate' },
  'network.tuneBridge': { tab: 'network', level: 'intermediate' },
  'network.perZoneLyricsOffset': { tab: 'network', level: 'intermediate' },
  'network.perZoneFixedVolume': { tab: 'network', level: 'intermediate' },
  'network.multiroomOffsets': { tab: 'network', level: 'expert' },
  'network.audioBackend': { tab: 'network', level: 'expert' },
  'network.replayGainPreamp': { tab: 'network', level: 'expert', sub: true, parent: 'network.replayGain' },
  'network.replayGainAntiClip': { tab: 'network', level: 'expert', sub: true, parent: 'network.replayGain' },
  'network.dsdNetwork': { tab: 'network', level: 'expert' },
  'network.perZoneDsdMode': { tab: 'network', level: 'expert' },
  'network.perZoneMaxSampleRate': { tab: 'network', level: 'expert' },
  'network.zoneAdvanced': { tab: 'network', level: 'expert' },

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
 * Réglages masqués parmi `keys`, au niveau donné.
 *
 * C'est la brique commune au compteur d'onglet et à la note de section : les
 * deux doivent désigner exactement le même ensemble, sans quoi une section
 * annoncerait un réglage que le pied d'onglet ignore, ou l'inverse.
 *
 * - un réglage MODIFIÉ n'est pas masqué (règle d'or) ;
 * - `isPresent` écarte les blocs qui ne se rendent pas du tout dans le
 *   contexte courant (« Emplacement des données » hors appliance, par-zone
 *   sans zone) : il n'y a rien à révéler en montant de niveau ;
 * - un SOUS-réglage (`sub`) n'est retenu que si `isParentOn` dit son parent
 *   allumé. Parent éteint ⇒ la ligne ne se rend pas, rien à annoncer.
 *
 * 🔴 Le point qui a motivé ce lot : `isParentOn` par défaut à « éteint »
 * reproduit l'ancien comportement, mais un sous-réglage dont le parent est
 * ALLUMÉ doit compter. « Valeurs par facette » (`library.oxygenFacetLimit`,
 * niveau expert, parent `library.oxygenEnable` de niveau intermédiaire) est
 * le cas d'espèce de #2131 : Oxygen allumé, la ligne se rend, un niveau
 * débutant ou intermédiaire la masque — et tant qu'elle était exclue du
 * compte, elle disparaissait SANS LAISSER DE TRACE, alors qu'elle continuait
 * de plafonner les facettes affichées. Un réglage caché qui agit quand même
 * et que rien ne signale, c'est exactement le défaut décrit dans #2131.
 */
export function hiddenKeysAmong(
  keys: readonly SettingKey[],
  userLevel: SettingsLevel,
  isModified: (key: SettingKey) => boolean = () => false,
  isPresent: (key: SettingKey) => boolean = () => true,
  isParentOn: (key: SettingKey) => boolean = () => false,
): SettingKey[] {
  const out: SettingKey[] = [];
  for (const key of keys) {
    const entry: SettingLevelEntry = SETTING_LEVELS[key];
    if (entry.sub && !isParentOn(key)) continue;
    if (!isPresent(key)) continue;
    if (!isSettingVisible(entry.level, userLevel, isModified(key))) out.push(key);
  }
  return out;
}

/** Toutes les clés du registre, dans l'ordre de déclaration. */
export function allSettingKeys(): SettingKey[] {
  return Object.keys(SETTING_LEVELS) as SettingKey[];
}

/**
 * Réglages masqués par onglet, sous forme de LISTE — ce que le compteur
 * « n réglages masqués » agrège, et ce dont `revealLevel` a besoin pour
 * choisir un niveau qui révèle vraiment quelque chose.
 */
export function hiddenKeysByTab(
  userLevel: SettingsLevel,
  isModified: (key: SettingKey) => boolean = () => false,
  isPresent: (key: SettingKey) => boolean = () => true,
  isParentOn: (key: SettingKey) => boolean = () => false,
): Record<SettingsTab, SettingKey[]> {
  const out: Record<SettingsTab, SettingKey[]> = {
    general: [], library: [], services: [], network: [], system: [],
  };
  for (const key of hiddenKeysAmong(allSettingKeys(), userLevel, isModified, isPresent, isParentOn)) {
    out[SETTING_LEVELS[key].tab].push(key);
  }
  return out;
}

/**
 * Nombre de réglages masqués par onglet au niveau donné, pour la ligne
 * « n réglages masqués — passez au niveau supérieur ».
 */
export function hiddenCountByTab(
  userLevel: SettingsLevel,
  isModified: (key: SettingKey) => boolean = () => false,
  isPresent: (key: SettingKey) => boolean = () => true,
  isParentOn: (key: SettingKey) => boolean = () => false,
): Record<SettingsTab, number> {
  const keys = hiddenKeysByTab(userLevel, isModified, isPresent, isParentOn);
  return {
    general: keys.general.length,
    library: keys.library.length,
    services: keys.services.length,
    network: keys.network.length,
    system: keys.system.length,
  };
}

/** Niveau immédiatement supérieur (expert reste expert). */
export function nextLevel(level: SettingsLevel): SettingsLevel {
  return SETTINGS_LEVELS[Math.min(levelRank(level) + 1, SETTINGS_LEVELS.length - 1)];
}

/**
 * Le plus bas niveau STRICTEMENT supérieur à `current` qui rend visible au
 * moins une des clés données — `null` s'il n'y en a aucun.
 *
 * `nextLevel` seul ne suffit pas : proposer « passez au niveau supérieur » à
 * un débutant dont les seuls réglages masqués sont de niveau EXPERT le fait
 * monter à intermédiaire… où rien n'apparaît. Le geste annoncé ne tient alors
 * pas sa promesse, et le réglage reste hors d'atteinte — le défaut même que
 * la ligne était censée réparer.
 */
export function revealLevel(
  keys: readonly SettingKey[],
  current: SettingsLevel,
): SettingsLevel | null {
  for (const candidate of SETTINGS_LEVELS) {
    if (levelRank(candidate) <= levelRank(current)) continue;
    if (keys.some((k) => levelRank(SETTING_LEVELS[k].level) <= levelRank(candidate))) return candidate;
  }
  return null;
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
