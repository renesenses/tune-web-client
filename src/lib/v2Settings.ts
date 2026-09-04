/**
 * Carte des Réglages du nouveau client (direction Levente).
 *
 * SOURCE UNIQUE : l'écran Réglages v2 ET la recherche du menu avatar lisent
 * cette même carte. Un réglage ajouté ici apparaît dans les deux, sans risque
 * de dérive entre l'index de recherche et l'écran réel.
 *
 * Réorganisation demandée par Bertrand (27/08), à partir de l'écran actuel
 * (7 onglets : general, library, services, network, system, clap, devices) :
 *   - « Réseau & Audio » devient AUDIO
 *   - « Qualité streaming » quitte Général pour Audio
 *   - Squeezebox et HQPlayer quittent Services pour Audio
 *   - « Services » devient ACCÈS ET JETONS
 *   - nouvel onglet ZONES : « Zones de lecture » (settings.zoneAutoCreate) et
 *     « Me suivre » (settings.followMe), tous deux issus de Services
 *   - « Réglages par zone » quitte Services pour APPAREILS
 *   - Bibliothèque inchangée (simplification prévue plus tard)
 *
 * `from` retient l'onglet d'origine : c'est la trace du déplacement, utile
 * pour vérifier qu'aucune section n'a été perdue au passage.
 *
 * `min` est le niveau d'interface à partir duquel la section est proposée
 * (voir lib/uiLevel). Règle d'or inchangée : un réglage non-défaut reste
 * visible — l'écran v2 ne masquera jamais une section déjà modifiée.
 */
import type { SettingsLevel } from './uiLevel';
// `fold` (minuscules + suppression des diacritiques) vient d'utils : une
// seconde implémentation locale aurait divergé de la recherche du reste de
// l'app — « Générale » et « generale » doivent matcher partout pareil.
import { fold } from './utils';

export type V2SettingsTabId =
  | 'general' | 'audio' | 'library' | 'zones' | 'devices' | 'extensions' | 'access' | 'system' | 'clap';

export interface V2SettingsSection {
  /** Identifiant stable, utilisé pour l'ancrage et la navigation. */
  id: string;
  /** Clé i18n du titre, quand elle existe dans les locales. */
  titleKey?: string;
  /** Titre littéral, pour les sections qui n'ont pas de clé (marques). */
  title?: string;
  /** Onglet d'origine dans l'écran actuel — trace du déplacement. */
  from: string;
  min: SettingsLevel;
  /** Mots-clés de recherche supplémentaires (synonymes, marques). */
  keywords?: string[];
}

export interface V2SettingsTab {
  id: V2SettingsTabId;
  /**
   * Clé i18n du libellé d'onglet. Les libellés étaient des chaînes FRANÇAISES
   * en dur alors que les sections, elles, portaient déjà `titleKey` : passer
   * l'interface en anglais laissait donc les sept onglets en français — la
   * moitié de la navigation ignorait la langue.
   */
  labelKey?: string;
  /** Libellé littéral, réservé aux noms produit qui ne se traduisent pas. */
  label?: string;
  icon: string;
  min: SettingsLevel;
  sections: V2SettingsSection[];
}

export const V2_SETTINGS: V2SettingsTab[] = [
  {
    id: 'general', labelKey: 'settings.tabGeneral', min: 'beginner',
    icon: 'M4 6h16M4 12h10M4 18h13',
    sections: [
      { id: 'playback',   titleKey: 'settings.playback',  from: 'general', min: 'beginner', keywords: ['lecture', 'volume'] },
      { id: 'interface',  titleKey: 'settings.interface', from: 'general', min: 'beginner', keywords: ['langue', 'thème', 'affichage'] },
      { id: 'voice',      title: 'Tune Voice AI',         from: 'general', min: 'expert',   keywords: ['voix', 'commande vocale'] },
    ],
  },
  {
    id: 'audio', labelKey: 'settings.tabAudio', min: 'beginner',
    icon: 'M4 15a8 8 0 0 1 16 0M7.5 15a4.5 4.5 0 0 1 9 0',
    sections: [
      { id: 'localAudio',    titleKey: 'settings.localAudio',          from: 'network', min: 'beginner', keywords: ['sortie', 'carte son', 'dac'] },
      { id: 'streamQuality', titleKey: 'settings.streamingQuality',    from: 'general', min: 'beginner', keywords: ['qualité', 'débit', 'flac'] },
      { id: 'netDevices',    titleKey: 'settings.networkDevices',      from: 'network', min: 'intermediate', keywords: ['dlna', 'upnp', 'chromecast'] },
      { id: 'squeezebox',    titleKey: 'settings.squeezebox',          from: 'services', min: 'intermediate', keywords: ['lyrion', 'lms', 'slimproto'] },
      { id: 'hqplayer',      title: 'HQPlayer',                        from: 'services', min: 'expert',   keywords: ['upsampling', 'naa'] },
      { id: 'bridge',        title: 'Tune Bridge',                     from: 'network', min: 'expert',   keywords: ['pont', 'relais'] },
      { id: 'dsd',           titleKey: 'settings.dsdNetworkTitle',     from: 'network', min: 'expert',   keywords: ['dsd', 'dop', 'sacd'] },
      { id: 'eqBands',       titleKey: 'settings.eqBandsTitle',        from: 'network', min: 'expert',   keywords: ['égaliseur', 'bandes'] },
      { id: 'audioDiag',     titleKey: 'settings.audioDiagnostic',     from: 'network', min: 'expert',   keywords: ['diagnostic', 'dépannage'] },
      { id: 'tuneServers',   titleKey: 'settings.tuneServersOnNetwork', from: 'network', min: 'expert',  keywords: ['serveurs', 'découverte'] },
      { id: 'wifi',          titleKey: 'settings.applianceWifi',       from: 'network', min: 'expert',   keywords: ['wifi', 'réseau', 'appliance'] },
    ],
  },
  {
    id: 'library', labelKey: 'settings.tabLibrary', min: 'beginner',
    icon: 'M4 5v14M9 5v14M14 6l5 13',
    sections: [
      { id: 'library',    titleKey: 'settings.library',      from: 'library', min: 'beginner' },
      { id: 'musicDirs',  titleKey: 'settings.musicDirs',    from: 'library', min: 'beginner', keywords: ['dossiers', 'chemins'] },
      { id: 'scanOpts',   titleKey: 'settings.scanOptions',  from: 'library', min: 'intermediate', keywords: ['analyse', 'scan'] },
      { id: 'scanSched',  titleKey: 'settings.scanSchedule', from: 'library', min: 'intermediate', keywords: ['planification', 'automatique'] },
      { id: 'metadata',   titleKey: 'metadata.title',        from: 'library', min: 'intermediate', keywords: ['métadonnées', 'tags'] },
      { id: 'enrichment', titleKey: 'settings.enrichment',   from: 'library', min: 'expert',   keywords: ['enrichissement', 'musicbrainz'] },
      { id: 'ingest',     titleKey: 'settings.ingest',       from: 'library', min: 'expert',   keywords: ['import', 'rangement'] },
      { id: 'oxygen',     titleKey: 'oxygen.settingsTitle',  from: 'library', min: 'expert' },
    ],
  },
  {
    id: 'zones', labelKey: 'settings.tabZones', min: 'beginner',
    icon: 'M6 3h12v18H6zM12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 7h.01',
    sections: [
      { id: 'zoneAutoCreate', titleKey: 'settings.zoneAutoCreate', from: 'services', min: 'beginner', keywords: ['zones de lecture', 'création automatique'] },
      { id: 'followMe',       titleKey: 'settings.followMe',       from: 'services', min: 'beginner', keywords: ['me suivre', 'suivi', 'pause'] },
    ],
  },
  {
    id: 'devices', labelKey: 'settings.tabDevices', min: 'intermediate',
    icon: 'M4 2h16v20H4zM12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    sections: [
      { id: 'devices',    titleKey: 'settings.tabDevices',       from: 'devices',  min: 'intermediate' },
      { id: 'perZone',    titleKey: 'settings.perZoneSettings',  from: 'services', min: 'intermediate', keywords: ['par zone', 'gapless', 'volume fixe'] },
    ],
  },
  {
    // Extensions : elles vivaient dans la barre latérale, section Studio. Elles
    // rejoignent les Réglages (Bertrand, 01/09/2026) et QUITTENT la barre — un
    // réglage à deux endroits finit par diverger, et la barre s'allège d'autant.
    id: 'extensions', labelKey: 'settings.tabExtensions', min: 'expert',
    icon: 'M9 3v4M15 3v4M8 7h8v5a4 4 0 0 1-8 0zM12 16v5',
    sections: [
      { id: 'plugins', titleKey: 'settings.tabExtensions', from: 'services', min: 'expert', keywords: ['extensions', 'plugins', 'greffons', 'modules'] },
    ],
  },
  {
    id: 'access', labelKey: 'settings.tabAccess', min: 'intermediate',
    icon: 'M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5M9 10V7a3 3 0 1 1 6 0v3',
    sections: [
      { id: 'streaming',   titleKey: 'settings.streaming', from: 'services', min: 'intermediate', keywords: ['qobuz', 'tidal', 'deezer'] },
      { id: 'tokens',      title: 'Services & Jetons',     from: 'services', min: 'intermediate', keywords: ['jetons', 'tokens', 'api', 'clés'] },
      { id: 'spotify',     title: 'Spotify Connect',       from: 'services', min: 'intermediate' },
      { id: 'accessFrom',  titleKey: 'settings.accessFromDevice', from: 'system', min: 'intermediate', keywords: ['accès', 'distant', 'url'] },
    ],
  },
  {
    id: 'system', labelKey: 'settings.tabSystem', min: 'beginner',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1',
    sections: [
      { id: 'about',      titleKey: 'settings.about',             from: 'system', min: 'beginner', keywords: ['version', 'à propos'] },
      { id: 'license',    titleKey: 'settings.tunePremiumLicense', from: 'system', min: 'beginner', keywords: ['licence', 'premium'] },
      { id: 'health',     titleKey: 'settings.serverHealth',      from: 'system', min: 'intermediate', keywords: ['santé', 'état serveur'] },
      { id: 'push',       titleKey: 'settings.pushNotifications', from: 'system', min: 'intermediate', keywords: ['notifications'] },
      { id: 'cloud',      title: 'Cloud',                         from: 'system', min: 'intermediate', keywords: ['sauvegarde', 'relais'] },
      { id: 'database',   titleKey: 'settings.database',          from: 'system', min: 'expert', keywords: ['base', 'sqlite', 'postgres'] },
      { id: 'dataLoc',    titleKey: 'settings.dataLocation',      from: 'system', min: 'expert', keywords: ['emplacement', 'données'] },
      { id: 'import',     titleKey: 'import.title',               from: 'system', min: 'expert' },
      { id: 'config',     titleKey: 'settings.configSection',     from: 'system', min: 'expert', keywords: ['configuration', 'fichier'] },
      { id: 'exportCsv',  titleKey: 'settings.exportCsv',         from: 'system', min: 'expert', keywords: ['export', 'csv'] },
    ],
  },
  {
    id: 'clap', label: 'CLAP', min: 'expert',
    icon: 'M2 12h2l2-7 3 14 3-10 2 5 2-2h6',
    sections: [
      { id: 'clap', titleKey: 'settings.tabClap', from: 'clap', min: 'expert', keywords: ['acoustique', 'analyse', 'ambiance'] },
    ],
  },
];

/** Aplatit la carte pour la recherche : chaque entrée porte son onglet. */
export interface V2SettingsHit {
  tab: V2SettingsTab;
  section: V2SettingsSection;
  label: string;
}

/**
 * Libellé affiché d'un onglet. Point de résolution UNIQUE : la recherche et les
 * deux écrans qui affichent un onglet passent par ici, sinon trois endroits
 * décideraient chacun quoi faire d'un `labelKey` absent.
 */
export function tabLabel(tab: V2SettingsTab, resolve: (key: string) => string): string {
  return tab.labelKey ? resolve(tab.labelKey) : (tab.label ?? tab.id);
}

/**
 * Recherche un réglage. `resolve` traduit une clé i18n — passé par l'appelant
 * pour que la recherche porte sur les libellés RÉELLEMENT affichés, et pas sur
 * les clés techniques.
 */
export function searchSettings(
  query: string,
  resolve: (key: string) => string,
  limit = 8,
): V2SettingsHit[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const hits: { hit: V2SettingsHit; score: number }[] = [];
  for (const tab of V2_SETTINGS) {
    for (const section of tab.sections) {
      const label = section.titleKey ? resolve(section.titleKey) : (section.title ?? section.id);
      const hay = [label, tabLabel(tab, resolve), ...(section.keywords ?? [])].map(fold);
      let score = -1;
      for (let i = 0; i < hay.length; i++) {
        const h = hay[i];
        if (h === q) { score = 100 - i; break; }
        if (h.startsWith(q)) { score = Math.max(score, 60 - i); }
        else if (h.includes(q)) { score = Math.max(score, 30 - i); }
      }
      if (score >= 0) hits.push({ hit: { tab, section, label }, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.hit);
}
